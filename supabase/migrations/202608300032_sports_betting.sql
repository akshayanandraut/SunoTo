-- Sportsbook: pari-mutuel (pool) betting on live cricket and football matches, in Sparks/Credits only
-- (never real money, never withdrawable -- same wallet as every other game on the platform). The
-- platform never sets fixed odds and never takes the other side of a bet -- every market is a shared
-- pool where winners split the pool proportionally to their own stake, minus a disclosed 5% platform
-- commission taken from the total pool. If nobody backed the winning outcome, the platform keeps the
-- whole pool (same convention as Andar Bahar/Dragon Tiger). This guarantees the platform can never be
-- put at risk the way a fixed-odds bookmaker can.
--
-- Admin creates matches/markets/outcomes and settles the winning outcome by hand for now (no live data
-- feed wired up yet -- see ROADMAP). Markets close to new bets either at their configured closes_at or
-- when an admin closes them manually ahead of settlement.

create table if not exists public.sport_matches (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('cricket','football')),
  home_team text not null,
  away_team text not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','completed','abandoned')),
  starts_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.sport_matches enable row level security;
revoke all on public.sport_matches from public,anon,authenticated;

create table if not exists public.sport_markets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.sport_matches(id) on delete cascade,
  market_type text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open','closed','settled','voided')),
  closes_at timestamptz,
  winning_outcome_id uuid,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sport_markets_match_idx on public.sport_markets(match_id);
alter table public.sport_markets enable row level security;
revoke all on public.sport_markets from public,anon,authenticated;

create table if not exists public.sport_market_outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.sport_markets(id) on delete cascade,
  label text not null,
  pool_credits bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists sport_market_outcomes_market_idx on public.sport_market_outcomes(market_id);
alter table public.sport_market_outcomes enable row level security;
revoke all on public.sport_market_outcomes from public,anon,authenticated;

create table if not exists public.sport_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  market_id uuid not null references public.sport_markets(id) on delete cascade,
  outcome_id uuid not null references public.sport_market_outcomes(id) on delete cascade,
  stake_credits bigint not null,
  payout_credits bigint,
  created_at timestamptz not null default now()
);
create index if not exists sport_bets_market_idx on public.sport_bets(market_id);
create index if not exists sport_bets_outcome_idx on public.sport_bets(outcome_id);
create index if not exists sport_bets_user_idx on public.sport_bets(user_id);
alter table public.sport_bets enable row level security;
revoke all on public.sport_bets from public,anon,authenticated;

-- Extend the shared daily-stake cap function (defined in the Andar Bahar migration) to also count sport bets.
create or replace function public.games_daily_stake_credits(target_user_id uuid)
returns bigint
language sql security definer set search_path = '' stable as $$
  select coalesce(sum(-delta),0)::bigint
  from public.wallet_ledger
  where user_id = target_user_id
    and entry_type in ('wheel_stake','jackpot_ticket','trivia_entry','snake_ladder_stake','rummy_stake','ludo_stake','teen_patti_stake','andar_bahar_stake','dragon_tiger_stake','sport_bet')
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.games_daily_stake_credits(uuid) from public,anon,authenticated;
grant execute on function public.games_daily_stake_credits(uuid) to service_role;

create or replace function public.place_sport_bet(target_user_id uuid,target_market_id uuid,target_outcome_id uuid,target_stake_credits bigint,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare stake_result record;market_row record;outcome_row record;daily_stake_cap constant bigint := 200000;max_single_stake constant bigint := 50000;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits > max_single_stake then raise exception 'invalid_stake' using errcode='22023';end if;
  select * into market_row from public.sport_markets where id = target_market_id for update;
  if market_row is null or market_row.status <> 'open' or (market_row.closes_at is not null and market_row.closes_at <= now()) then raise exception 'market_closed' using errcode='P0001';end if;
  select * into outcome_row from public.sport_market_outcomes where id = target_outcome_id and market_id = target_market_id;
  if outcome_row is null then raise exception 'invalid_outcome' using errcode='22023';end if;
  if public.games_daily_stake_credits(target_user_id) + target_stake_credits > daily_stake_cap then raise exception 'daily_stake_cap_reached' using errcode='P0001';end if;
  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'sport_bet','Sports bet',target_idempotency_key,jsonb_build_object('market_id',target_market_id,'outcome_id',target_outcome_id));
  insert into public.sport_bets(user_id,market_id,outcome_id,stake_credits) values(target_user_id,target_market_id,target_outcome_id,target_stake_credits);
  update public.sport_market_outcomes set pool_credits = pool_credits + target_stake_credits where id = target_outcome_id;
  balance:=stake_result.balance;return next;
end;
$$;
revoke all on function public.place_sport_bet(uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.place_sport_bet(uuid,uuid,uuid,bigint,text) to service_role;

create or replace function public.void_sport_market(target_market_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare bet_row record;market_row record;
begin
  select * into market_row from public.sport_markets where id = target_market_id for update;
  if market_row is null or market_row.status in ('settled','voided') then raise exception 'invalid_market_state' using errcode='P0001';end if;
  for bet_row in select * from public.sport_bets where market_id = target_market_id loop
    perform public.apply_wallet_entry(bet_row.user_id,bet_row.stake_credits,'sport_bet_refund','Sports bet refund',bet_row.id::text,jsonb_build_object('market_id',target_market_id));
  end loop;
  update public.sport_markets set status = 'voided' where id = target_market_id;
end;
$$;
revoke all on function public.void_sport_market(uuid) from public,anon,authenticated;
grant execute on function public.void_sport_market(uuid) to service_role;

create or replace function public.close_sport_market(target_market_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.sport_markets set status = 'closed' where id = target_market_id and status = 'open';
end;
$$;
revoke all on function public.close_sport_market(uuid) from public,anon,authenticated;
grant execute on function public.close_sport_market(uuid) to service_role;

create or replace function public.settle_sport_market(target_market_id uuid,target_winning_outcome_id uuid)
returns table(total_pool bigint, house_take bigint, winners_paid int)
language plpgsql security definer set search_path = '' as $$
declare market_row record;winning_pool bigint;distributable bigint;bet_row record;payout bigint;paid_count int := 0;computed_house_take bigint;
begin
  select * into market_row from public.sport_markets where id = target_market_id for update;
  if market_row is null or market_row.status not in ('open','closed') then raise exception 'invalid_market_state' using errcode='P0001';end if;
  if not exists(select 1 from public.sport_market_outcomes where id = target_winning_outcome_id and market_id = target_market_id) then raise exception 'invalid_outcome' using errcode='22023';end if;
  select coalesce(sum(pool_credits),0) into total_pool from public.sport_market_outcomes where market_id = target_market_id;
  select coalesce(pool_credits,0) into winning_pool from public.sport_market_outcomes where id = target_winning_outcome_id;
  if total_pool <= 0 then computed_house_take := 0;
  elsif winning_pool <= 0 then computed_house_take := total_pool;
  else
    computed_house_take := floor(total_pool * 0.05)::bigint;
    distributable := total_pool - computed_house_take;
    for bet_row in select * from public.sport_bets where market_id = target_market_id and outcome_id = target_winning_outcome_id loop
      payout := floor(bet_row.stake_credits::numeric * distributable / winning_pool)::bigint;
      if payout > 0 then
        perform public.apply_wallet_entry(bet_row.user_id,payout,'sport_payout','Sports bet winnings',bet_row.id::text||':payout',jsonb_build_object('market_id',target_market_id,'outcome_id',target_winning_outcome_id));
        insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('sport_betting',bet_row.user_id,bet_row.stake_credits,payout,jsonb_build_object('market_id',target_market_id,'winning_outcome_id',target_winning_outcome_id));
        paid_count := paid_count + 1;
      end if;
      update public.sport_bets set payout_credits = payout where id = bet_row.id;
    end loop;
  end if;
  if computed_house_take > 0 then
    perform public.credit_platform_revenue('sport_betting',computed_house_take,'Sportsbook commission',target_market_id::text,jsonb_build_object('market_id',target_market_id,'total_pool',total_pool,'winning_outcome_id',target_winning_outcome_id));
  end if;
  update public.sport_markets set status = 'settled', winning_outcome_id = target_winning_outcome_id, settled_at = now() where id = target_market_id;
  house_take := computed_house_take;winners_paid := paid_count;return next;
end;
$$;
revoke all on function public.settle_sport_market(uuid,uuid) from public,anon,authenticated;
grant execute on function public.settle_sport_market(uuid,uuid) to service_role;

create or replace function public.admin_create_sport_market(target_match_id uuid,target_market_type text,target_description text,target_closes_at timestamptz,target_outcome_labels text[])
returns table(id uuid)
language plpgsql security definer set search_path = '' as $$
declare new_market_id uuid;label text;
begin
  if target_outcome_labels is null or array_length(target_outcome_labels,1) < 2 then raise exception 'invalid_outcomes' using errcode='22023';end if;
  insert into public.sport_markets(match_id,market_type,description,closes_at) values(target_match_id,target_market_type,coalesce(target_description,''),target_closes_at) returning sport_markets.id into new_market_id;
  foreach label in array target_outcome_labels loop
    insert into public.sport_market_outcomes(market_id,label) values(new_market_id,label);
  end loop;
  id:=new_market_id;return next;
end;
$$;
revoke all on function public.admin_create_sport_market(uuid,text,text,timestamptz,text[]) from public,anon,authenticated;
grant execute on function public.admin_create_sport_market(uuid,text,text,timestamptz,text[]) to service_role;
