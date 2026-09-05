-- Arcade: Coin Flip. Disclosed, stake-tiered house-favoured odds -- bigger stakes get a lower win
-- probability (published in coin_flip_tiers so it's auditable, same transparency pattern as
-- wheel_segments / reflex_tap_tiers). A normal win only ever returns the player's own stake
-- (multiplier_bp=10000, net zero for that round); a small extra "bonus" slice on top of a win is
-- only ever paid out of banked house margin already collected from this game (see the
-- coin_flip_bonus_pool check below), so the house can never go net-negative on Coin Flip in
-- aggregate, no matter how the bonus rolls land.

create table if not exists public.coin_flip_tiers (
  id smallint primary key,
  label text not null,
  max_stake_credits bigint not null,
  win_probability_bp int not null check (win_probability_bp >= 0 and win_probability_bp <= 10000),
  bonus_probability_bp int not null check (bonus_probability_bp >= 0 and bonus_probability_bp <= 10000),
  bonus_multiplier_bp int not null check (bonus_multiplier_bp >= 10000)
);
insert into public.coin_flip_tiers(id,label,max_stake_credits,win_probability_bp,bonus_probability_bp,bonus_multiplier_bp) values
  (1,'Small stake',1000,4000,500,15000),
  (2,'Medium stake',5000,3000,300,15000),
  (3,'Large stake',50000,2000,150,15000)
on conflict (id) do update set label=excluded.label,max_stake_credits=excluded.max_stake_credits,win_probability_bp=excluded.win_probability_bp,bonus_probability_bp=excluded.bonus_probability_bp,bonus_multiplier_bp=excluded.bonus_multiplier_bp;

alter table public.coin_flip_tiers enable row level security;
grant select on public.coin_flip_tiers to authenticated, anon;
create policy "anyone reads coin flip tiers" on public.coin_flip_tiers for select to authenticated, anon using (true);

create or replace function public.play_coin_flip(target_user_id uuid,target_stake_credits bigint,target_call text,target_idempotency_key text)
returns table(credits_balance bigint,payout_credits bigint,outcome_side text,won boolean,bonus boolean,round_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  current_wallet_balance bigint;stake_result record;payout_result record;house_take bigint;
  chosen public.coin_flip_tiers%rowtype;
  roll_win int;roll_bonus int;multiplier_bp int;
  banked_margin bigint;bonus_paid_total bigint;bonus_extra_credits bigint;
begin
  if target_call is null or target_call not in ('heads','tails') then raise exception 'invalid_call' using errcode='22023';end if;
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits % 100 <> 0 then raise exception 'invalid_stake' using errcode='22023';end if;
  select balance into current_wallet_balance from public.wallets where user_id=target_user_id;
  if coalesce(current_wallet_balance,0) < 10000 then raise exception 'minimum_100_sparks_required' using errcode='P0001';end if;

  select * into chosen from public.coin_flip_tiers where target_stake_credits <= max_stake_credits order by max_stake_credits asc limit 1;
  if not found then raise exception 'invalid_stake' using errcode='22023';end if;

  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'coin_flip_stake','Coin Flip stake',target_idempotency_key||':stake',jsonb_build_object('game','coin_flip','call',target_call));

  roll_win:=floor(random()*10000)::int;
  outcome_side:=case when roll_win < chosen.win_probability_bp then target_call else (case when target_call='heads' then 'tails' else 'heads' end) end;
  won:=(outcome_side=target_call);
  bonus:=false;
  multiplier_bp:=0;

  if won then
    multiplier_bp:=10000;
    roll_bonus:=floor(random()*10000)::int;
    if roll_bonus < chosen.bonus_probability_bp then
      bonus_extra_credits:=floor(target_stake_credits::numeric*(chosen.bonus_multiplier_bp-10000)/10000)::bigint;
      select coalesce(sum(credits_amount),0) into banked_margin from public.platform_revenue_ledger where source='coin_flip';
      select coalesce(sum(payout_credits-stake_credits),0) into bonus_paid_total from public.game_rounds where game_type='coin_flip' and (outcome->>'bonus')='true';
      banked_margin:=banked_margin-bonus_paid_total;
      if banked_margin >= bonus_extra_credits then
        multiplier_bp:=chosen.bonus_multiplier_bp;
        bonus:=true;
      end if;
    end if;
  end if;

  payout_credits:=floor(target_stake_credits::numeric*multiplier_bp/10000)::bigint;
  if payout_credits > 0 then
    select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'coin_flip_payout','Coin Flip payout',target_idempotency_key||':payout',jsonb_build_object('game','coin_flip','call',target_call,'outcome',outcome_side,'bonus',bonus));
    credits_balance:=payout_result.balance;
  else
    credits_balance:=stake_result.balance;
  end if;

  house_take:=target_stake_credits-payout_credits;
  if house_take > 0 then
    perform public.credit_platform_revenue('coin_flip',house_take,'Coin Flip round margin',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'stake',target_stake_credits,'payout',payout_credits));
  end if;

  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('coin_flip',target_user_id,target_stake_credits,payout_credits,jsonb_build_object('call',target_call,'outcome_side',outcome_side,'won',won,'bonus',bonus,'multiplier_bp',multiplier_bp)) returning id into round_id;
  return next;
end;
$$;
revoke all on function public.play_coin_flip(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.play_coin_flip(uuid,bigint,text,text) to service_role;
