-- Solo: Streak Ladder. Stake once, then climb a disclosed-odds ladder of increasingly risky
-- yes/no calls -- each successful climb raises your payout multiplier but lowers the odds of the
-- next climb succeeding. Bust at any rung and the whole stake is lost; cash out after any
-- successful climb to lock in the current multiplier. Reuses the same disclosed-tiers-table
-- pattern as coin_flip_tiers/coin_tower_tiers so the odds are auditable, and the same
-- stake-then-resolve wallet-ledger flow as the rest of the solo Sparks games.

create table if not exists public.streak_ladder_rungs (
  rung smallint primary key check (rung >= 1),
  label text not null,
  survive_probability_bp int not null check (survive_probability_bp > 0 and survive_probability_bp <= 10000),
  payout_multiplier_bp int not null check (payout_multiplier_bp >= 10000)
);
insert into public.streak_ladder_rungs(rung,label,survive_probability_bp,payout_multiplier_bp) values
  (1,'Rung 1',6000,15000),
  (2,'Rung 2',5000,27000),
  (3,'Rung 3',4000,50000),
  (4,'Rung 4',3000,100000),
  (5,'Rung 5 (top)',2000,220000)
on conflict (rung) do update set label=excluded.label,survive_probability_bp=excluded.survive_probability_bp,payout_multiplier_bp=excluded.payout_multiplier_bp;

alter table public.streak_ladder_rungs enable row level security;
grant select on public.streak_ladder_rungs to authenticated, anon;
create policy "anyone reads streak ladder rungs" on public.streak_ladder_rungs for select to authenticated, anon using (true);

create table if not exists public.streak_ladder_rounds (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stake_credits bigint not null check (stake_credits > 0),
  current_rung smallint not null default 0,
  status text not null default 'active' check (status in ('active','cashed_out','busted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists streak_ladder_rounds_user_idx on public.streak_ladder_rounds(user_id,status);
alter table public.streak_ladder_rounds enable row level security;
revoke all on public.streak_ladder_rounds from anon,authenticated;
grant select on public.streak_ladder_rounds to authenticated;
create policy "users read their own streak ladder rounds" on public.streak_ladder_rounds for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.games_daily_stake_credits(target_user_id uuid)
returns bigint
language sql security definer set search_path = '' stable as $$
  select coalesce(sum(-delta),0)::bigint
  from public.wallet_ledger
  where user_id = target_user_id
    and entry_type in ('wheel_stake','jackpot_ticket','trivia_entry','snake_ladder_stake','rummy_stake','ludo_stake','teen_patti_stake','andar_bahar_stake','dragon_tiger_stake','bidding_stake','tug_of_war_stake','elimination_reflex_stake','prediction_pool_stake','streak_ladder_stake')
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.games_daily_stake_credits(uuid) from public,anon,authenticated;
grant execute on function public.games_daily_stake_credits(uuid) to service_role;

create or replace function public.start_streak_ladder_round(target_user_id uuid,target_stake_credits bigint,target_idempotency_key text)
returns table(round_id bigint,credits_balance bigint,current_rung smallint)
language plpgsql security definer set search_path = '' as $$
declare
  stake_result record;
  new_round public.streak_ladder_rounds%rowtype;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits % 100 <> 0 then raise exception 'invalid_stake' using errcode='22023'; end if;

  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'streak_ladder_stake','Streak Ladder stake',target_idempotency_key||':stake',jsonb_build_object('game','streak_ladder'));

  insert into public.streak_ladder_rounds(user_id,stake_credits,current_rung,status)
  values(target_user_id,target_stake_credits,0,'active')
  returning * into new_round;

  round_id:=new_round.id;credits_balance:=stake_result.balance;current_rung:=new_round.current_rung;
  return next;
end;
$$;
revoke all on function public.start_streak_ladder_round(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.start_streak_ladder_round(uuid,bigint,text) to service_role;

create or replace function public.climb_streak_ladder_round(target_user_id uuid,target_round_id bigint,target_idempotency_key text)
returns table(round_id bigint,current_rung smallint,survived boolean,busted boolean,maxed_out boolean,credits_balance bigint,payout_credits bigint)
language plpgsql security definer set search_path = '' as $$
declare
  round_row public.streak_ladder_rounds%rowtype;
  next_rung smallint;
  rung_row public.streak_ladder_rungs%rowtype;
  roll int;
  payout_result record;
  max_rung smallint;
begin
  select * into round_row from public.streak_ladder_rounds where id=target_round_id and user_id=target_user_id for update;
  if not found then raise exception 'round_not_found' using errcode='P0002'; end if;
  if round_row.status <> 'active' then raise exception 'round_not_active' using errcode='P0001'; end if;

  select max(rung) into max_rung from public.streak_ladder_rungs;
  next_rung:=round_row.current_rung+1;
  if next_rung > max_rung then raise exception 'already_maxed' using errcode='P0001'; end if;

  select * into rung_row from public.streak_ladder_rungs where rung=next_rung;
  roll:=floor(random()*10000)::int;
  payout_credits:=0;

  if roll < rung_row.survive_probability_bp then
    survived:=true;busted:=false;
    if next_rung=max_rung then
      maxed_out:=true;
      payout_credits:=floor(round_row.stake_credits::numeric*rung_row.payout_multiplier_bp/10000)::bigint;
      select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'streak_ladder_payout','Streak Ladder payout (maxed)',target_idempotency_key||':payout',jsonb_build_object('game','streak_ladder','rung',next_rung));
      update public.streak_ladder_rounds set current_rung=next_rung,status='cashed_out',updated_at=now() where id=target_round_id;
      credits_balance:=payout_result.balance;
    else
      maxed_out:=false;
      update public.streak_ladder_rounds set current_rung=next_rung,updated_at=now() where id=target_round_id;
      select balance into credits_balance from public.wallets where user_id=target_user_id;
    end if;
  else
    survived:=false;busted:=true;maxed_out:=false;
    update public.streak_ladder_rounds set status='busted',updated_at=now() where id=target_round_id;
    perform public.credit_platform_revenue('streak_ladder',round_row.stake_credits,'Streak Ladder bust',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'round_id',target_round_id,'rung',next_rung));
    select balance into credits_balance from public.wallets where user_id=target_user_id;
  end if;

  round_id:=target_round_id;current_rung:=next_rung;
  return next;
end;
$$;
revoke all on function public.climb_streak_ladder_round(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.climb_streak_ladder_round(uuid,bigint,text) to service_role;

create or replace function public.cashout_streak_ladder_round(target_user_id uuid,target_round_id bigint,target_idempotency_key text)
returns table(round_id bigint,credits_balance bigint,payout_credits bigint,current_rung smallint)
language plpgsql security definer set search_path = '' as $$
declare
  round_row public.streak_ladder_rounds%rowtype;
  rung_row public.streak_ladder_rungs%rowtype;
  payout_result record;
begin
  select * into round_row from public.streak_ladder_rounds where id=target_round_id and user_id=target_user_id for update;
  if not found then raise exception 'round_not_found' using errcode='P0002'; end if;
  if round_row.status <> 'active' then raise exception 'round_not_active' using errcode='P0001'; end if;
  if round_row.current_rung < 1 then raise exception 'nothing_to_cash_out' using errcode='P0001'; end if;

  select * into rung_row from public.streak_ladder_rungs where rung=round_row.current_rung;
  payout_credits:=floor(round_row.stake_credits::numeric*rung_row.payout_multiplier_bp/10000)::bigint;

  select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'streak_ladder_payout','Streak Ladder cash out',target_idempotency_key||':payout',jsonb_build_object('game','streak_ladder','rung',round_row.current_rung));
  update public.streak_ladder_rounds set status='cashed_out',updated_at=now() where id=target_round_id;

  round_id:=target_round_id;credits_balance:=payout_result.balance;current_rung:=round_row.current_rung;
  return next;
end;
$$;
revoke all on function public.cashout_streak_ladder_round(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.cashout_streak_ladder_round(uuid,bigint,text) to service_role;
