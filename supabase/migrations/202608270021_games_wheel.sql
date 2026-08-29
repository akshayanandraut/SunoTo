-- Games platform: there is only ever one real balance -- Credits (the existing `wallets` table).
-- "Sparks" is a UI-only relabeling: 1 Spark = 100 Credits, purely for display in the Games screens.
-- All staking/payout math here operates directly on Credits via the existing apply_wallet_entry.
-- House-edge model: fixed, disclosed multiplier table per spin. No manipulation, no fake users.
-- Minimum spend before a user may enter any game: 10000 Credits (= 100 Sparks) wallet balance.

create table if not exists public.game_rounds (
  id bigint generated always as identity primary key,
  game_type text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  stake_credits bigint not null check (stake_credits > 0),
  payout_credits bigint not null default 0 check (payout_credits >= 0),
  outcome jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists game_rounds_user_created_idx on public.game_rounds(user_id, created_at desc);
create index if not exists game_rounds_type_created_idx on public.game_rounds(game_type, created_at desc);

alter table public.game_rounds enable row level security;
revoke all on public.game_rounds from anon, authenticated;
grant select on public.game_rounds to authenticated;
create policy "users read own game rounds" on public.game_rounds for select to authenticated using ((select auth.uid()) = user_id);

-- Platform revenue: the rake skimmed off every game round, in Credits. Never paid out to any user.
create table if not exists public.platform_revenue_ledger (
  id bigint generated always as identity primary key,
  source text not null,
  credits_amount bigint not null check (credits_amount > 0),
  reason text not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.platform_revenue_ledger enable row level security;
revoke all on public.platform_revenue_ledger from anon, authenticated;

create or replace function public.credit_platform_revenue(revenue_source text,revenue_credits_amount bigint,revenue_reason text,revenue_idempotency_key text,revenue_metadata jsonb default '{}'::jsonb)
returns table(ledger_id bigint,idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare existing public.platform_revenue_ledger%rowtype;
begin
  if revenue_credits_amount <= 0 then raise exception 'invalid_revenue_amount' using errcode='22023';end if;
  select * into existing from public.platform_revenue_ledger where idempotency_key=revenue_idempotency_key;
  if existing.id is not null then return query select existing.id,true;return;end if;
  insert into public.platform_revenue_ledger(source,credits_amount,reason,idempotency_key,metadata) values(revenue_source,revenue_credits_amount,revenue_reason,revenue_idempotency_key,coalesce(revenue_metadata,'{}'::jsonb)) returning id into ledger_id;
  idempotent:=false;return next;
end;
$$;
revoke all on function public.credit_platform_revenue(text,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.credit_platform_revenue(text,bigint,text,text,jsonb) to service_role;

-- Disclosed, static multiplier table. weight_bp sums to 10000. multiplier_bp is basis points of stake (10000 = 1.0x).
-- Expected value per spin = sum(weight_bp/10000 * multiplier_bp/10000) = 0.75 -> a 25% disclosed house edge.
-- Max multiplier capped at 1.5x per the "never pay out more than 30-50% above stake" rule.
create table if not exists public.wheel_segments (
  id smallint primary key,
  label text not null,
  weight_bp int not null check (weight_bp > 0),
  multiplier_bp int not null check (multiplier_bp >= 0 and multiplier_bp <= 15000)
);
insert into public.wheel_segments(id,label,weight_bp,multiplier_bp) values
  (1,'Empty',2000,0),
  (2,'0.6x',3000,6000),
  (3,'1x',3000,10000),
  (4,'1.3x',1500,13000),
  (5,'1.5x (Jackpot segment)',500,15000)
on conflict (id) do update set label=excluded.label,weight_bp=excluded.weight_bp,multiplier_bp=excluded.multiplier_bp;

alter table public.wheel_segments enable row level security;
grant select on public.wheel_segments to authenticated, anon;
create policy "anyone reads wheel odds" on public.wheel_segments for select to authenticated, anon using (true);

-- target_stake_credits must be a whole multiple of 100 (i.e. a whole number of Sparks) so the UI's
-- Sparks display never shows a fraction. Minimum wallet balance to play: 10000 Credits (100 Sparks).
create or replace function public.play_wheel_spin(target_user_id uuid,target_stake_credits bigint,target_idempotency_key text)
returns table(credits_balance bigint,payout_credits bigint,segment_label text,multiplier_bp int,round_id bigint)
language plpgsql security definer set search_path = '' as $$
declare current_wallet_balance bigint;roll int;cumulative int;chosen public.wheel_segments%rowtype;stake_result record;payout_result record;house_take bigint;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits % 100 <> 0 then raise exception 'invalid_stake' using errcode='22023';end if;
  select balance into current_wallet_balance from public.wallets where user_id=target_user_id;
  if coalesce(current_wallet_balance,0) < 10000 then raise exception 'minimum_100_sparks_required' using errcode='P0001';end if;
  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'wheel_stake','Wheel of Fortune spin',target_idempotency_key||':stake',jsonb_build_object('game','wheel'));

  roll:=floor(random()*10000)::int;
  cumulative:=0;
  for chosen in select * from public.wheel_segments order by id loop
    cumulative:=cumulative+chosen.weight_bp;
    exit when roll < cumulative;
  end loop;

  payout_credits:=floor(target_stake_credits::numeric*chosen.multiplier_bp/10000)::bigint;
  if payout_credits > 0 then
    select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'wheel_payout','Wheel of Fortune payout',target_idempotency_key||':payout',jsonb_build_object('game','wheel','segment',chosen.label));
    credits_balance:=payout_result.balance;
  else
    credits_balance:=stake_result.balance;
  end if;

  house_take:=target_stake_credits-payout_credits;
  if house_take > 0 then
    perform public.credit_platform_revenue('wheel',house_take,'Wheel of Fortune round margin',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'stake',target_stake_credits,'payout',payout_credits));
  end if;

  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('wheel',target_user_id,target_stake_credits,payout_credits,jsonb_build_object('segment',chosen.label,'multiplier_bp',chosen.multiplier_bp,'roll',roll)) returning id into round_id;

  segment_label:=chosen.label;multiplier_bp:=chosen.multiplier_bp;return next;
end;
$$;
revoke all on function public.play_wheel_spin(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.play_wheel_spin(uuid,bigint,text) to service_role;

-- Real-money payout of winnings: not offered yet. Table exists so the "coming soon" UI has something
-- to point to later without another migration, but no RPC/route processes these rows yet.
create table if not exists public.payout_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  credits_amount bigint not null check (credits_amount > 0),
  status text not null default 'coming_soon',
  created_at timestamptz not null default now()
);
alter table public.payout_requests enable row level security;
revoke all on public.payout_requests from anon, authenticated;
