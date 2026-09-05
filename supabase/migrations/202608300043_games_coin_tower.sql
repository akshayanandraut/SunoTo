-- Arcade: Coin Tower. A "coin pusher" style game: players drop a coin onto a stake pool and it
-- either falls flat (no payout), gets nudged back (stake refunded), knocks a small pile off the
-- ledge (2x), or -- very rarely -- topples the whole tower (a big multiplier). Same disclosed,
-- stake-tiered, house-favoured odds pattern as coin_flip_tiers, published in coin_tower_tiers so
-- it's auditable. The big "topple" multiplier is only ever paid out of margin already banked from
-- this game (checked against platform_revenue_ledger minus prior topple payouts, same guard as
-- Coin Flip's bonus), so the house can never go net-negative on Coin Tower in aggregate, however
-- the topple rolls land -- it only pays when the collective pool of stakes/margin already
-- collected can genuinely cover it.

create table if not exists public.coin_tower_tiers (
  id smallint primary key,
  label text not null,
  max_stake_credits bigint not null,
  refund_probability_bp int not null check (refund_probability_bp >= 0 and refund_probability_bp <= 10000),
  win_probability_bp int not null check (win_probability_bp >= 0 and win_probability_bp <= 10000),
  win_multiplier_bp int not null check (win_multiplier_bp >= 10000),
  topple_probability_bp int not null check (topple_probability_bp >= 0 and topple_probability_bp <= 10000),
  topple_multiplier_bp int not null check (topple_multiplier_bp >= 10000),
  check (refund_probability_bp + win_probability_bp + topple_probability_bp <= 10000)
);
insert into public.coin_tower_tiers(id,label,max_stake_credits,refund_probability_bp,win_probability_bp,win_multiplier_bp,topple_probability_bp,topple_multiplier_bp) values
  (1,'Small stake',1000,3500,450,20000,50,100000),
  (2,'Medium stake',5000,2700,280,20000,20,100000),
  (3,'Large stake',50000,1900,90,20000,10,100000)
on conflict (id) do update set label=excluded.label,max_stake_credits=excluded.max_stake_credits,refund_probability_bp=excluded.refund_probability_bp,win_probability_bp=excluded.win_probability_bp,win_multiplier_bp=excluded.win_multiplier_bp,topple_probability_bp=excluded.topple_probability_bp,topple_multiplier_bp=excluded.topple_multiplier_bp;

alter table public.coin_tower_tiers enable row level security;
grant select on public.coin_tower_tiers to authenticated, anon;
create policy "anyone reads coin tower tiers" on public.coin_tower_tiers for select to authenticated, anon using (true);

create or replace function public.play_coin_tower_drop(target_user_id uuid,target_stake_credits bigint,target_idempotency_key text)
returns table(credits_balance bigint,payout_credits bigint,outcome_tier text,topple boolean,multiplier_bp int,round_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  current_wallet_balance bigint;stake_result record;payout_result record;house_take bigint;
  chosen public.coin_tower_tiers%rowtype;
  roll int;topple_extra_credits bigint;banked_margin bigint;topple_paid_total bigint;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits % 100 <> 0 then raise exception 'invalid_stake' using errcode='22023';end if;
  select balance into current_wallet_balance from public.wallets where user_id=target_user_id;
  if coalesce(current_wallet_balance,0) < 10000 then raise exception 'minimum_100_sparks_required' using errcode='P0001';end if;

  select * into chosen from public.coin_tower_tiers where target_stake_credits <= max_stake_credits order by max_stake_credits asc limit 1;
  if not found then raise exception 'invalid_stake' using errcode='22023';end if;

  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'coin_tower_stake','Coin Tower stake',target_idempotency_key||':stake',jsonb_build_object('game','coin_tower'));

  roll:=floor(random()*10000)::int;
  topple:=false;
  multiplier_bp:=0;

  if roll < chosen.topple_probability_bp then
    topple_extra_credits:=floor(target_stake_credits::numeric*(chosen.topple_multiplier_bp-10000)/10000)::bigint;
    select coalesce(sum(credits_amount),0) into banked_margin from public.platform_revenue_ledger where source='coin_tower';
    select coalesce(sum(payout_credits-stake_credits),0) into topple_paid_total from public.game_rounds where game_type='coin_tower' and (outcome->>'topple')='true';
    banked_margin:=banked_margin-topple_paid_total;
    if banked_margin >= topple_extra_credits then
      multiplier_bp:=chosen.topple_multiplier_bp;topple:=true;outcome_tier:='topple';
    else
      multiplier_bp:=10000;outcome_tier:='refund';
    end if;
  elsif roll < chosen.topple_probability_bp + chosen.win_probability_bp then
    multiplier_bp:=chosen.win_multiplier_bp;outcome_tier:='win';
  elsif roll < chosen.topple_probability_bp + chosen.win_probability_bp + chosen.refund_probability_bp then
    multiplier_bp:=10000;outcome_tier:='refund';
  else
    multiplier_bp:=0;outcome_tier:='lose';
  end if;

  payout_credits:=floor(target_stake_credits::numeric*multiplier_bp/10000)::bigint;
  if payout_credits > 0 then
    select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'coin_tower_payout','Coin Tower payout',target_idempotency_key||':payout',jsonb_build_object('game','coin_tower','tier',outcome_tier,'topple',topple));
    credits_balance:=payout_result.balance;
  else
    credits_balance:=stake_result.balance;
  end if;

  house_take:=target_stake_credits-payout_credits;
  if house_take > 0 then
    perform public.credit_platform_revenue('coin_tower',house_take,'Coin Tower round margin',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'stake',target_stake_credits,'payout',payout_credits));
  end if;

  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('coin_tower',target_user_id,target_stake_credits,payout_credits,jsonb_build_object('tier',outcome_tier,'topple',topple,'multiplier_bp',multiplier_bp)) returning id into round_id;
  return next;
end;
$$;
revoke all on function public.play_coin_tower_drop(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.play_coin_tower_drop(uuid,bigint,text) to service_role;
