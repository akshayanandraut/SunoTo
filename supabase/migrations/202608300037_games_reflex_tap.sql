-- Arcade: Reflex Tap. A solo skill game -- reusing game_rounds/credit_platform_revenue from the
-- Wheel migration. Unlike Wheel, payout is driven entirely by the player's own reaction time
-- (client-measured, server-bounded), not randomness. Same disclosed-multiplier-table pattern as
-- wheel_segments so the payout ladder is transparent and auditable.

create table if not exists public.reflex_tap_tiers (
  id smallint primary key,
  label text not null,
  max_response_ms int not null,
  multiplier_bp int not null check (multiplier_bp >= 0 and multiplier_bp <= 15000)
);
insert into public.reflex_tap_tiers(id,label,max_response_ms,multiplier_bp) values
  (1,'Lightning',180,15000),
  (2,'Fast',280,13000),
  (3,'On time',400,10000),
  (4,'Slow',600,6000),
  (5,'Too slow',999999,0)
on conflict (id) do update set label=excluded.label,max_response_ms=excluded.max_response_ms,multiplier_bp=excluded.multiplier_bp;

alter table public.reflex_tap_tiers enable row level security;
grant select on public.reflex_tap_tiers to authenticated, anon;
create policy "anyone reads reflex tap tiers" on public.reflex_tap_tiers for select to authenticated, anon using (true);

-- target_response_ms is client-measured time between the "go" signal and the tap; bounded to a sane
-- range server-side. target_false_start marks a tap registered before the "go" signal (always pays 0).
create or replace function public.play_reflex_tap_round(target_user_id uuid,target_stake_credits bigint,target_response_ms int,target_false_start boolean,target_idempotency_key text)
returns table(credits_balance bigint,payout_credits bigint,tier_label text,multiplier_bp int,round_id bigint)
language plpgsql security definer set search_path = '' as $$
declare current_wallet_balance bigint;chosen public.reflex_tap_tiers%rowtype;stake_result record;payout_result record;house_take bigint;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits % 100 <> 0 then raise exception 'invalid_stake' using errcode='22023';end if;
  if target_response_ms is null or target_response_ms < 0 or target_response_ms > 10000 then raise exception 'invalid_response_time' using errcode='22023';end if;
  select balance into current_wallet_balance from public.wallets where user_id=target_user_id;
  if coalesce(current_wallet_balance,0) < 10000 then raise exception 'minimum_100_sparks_required' using errcode='P0001';end if;
  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'reflex_tap_stake','Reflex Tap entry',target_idempotency_key||':stake',jsonb_build_object('game','reflex_tap'));

  if coalesce(target_false_start,false) then
    select * into chosen from public.reflex_tap_tiers where multiplier_bp=0 order by id desc limit 1;
  else
    select * into chosen from public.reflex_tap_tiers where target_response_ms <= max_response_ms order by max_response_ms asc limit 1;
  end if;

  payout_credits:=floor(target_stake_credits::numeric*chosen.multiplier_bp/10000)::bigint;
  if payout_credits > 0 then
    select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'reflex_tap_payout','Reflex Tap payout',target_idempotency_key||':payout',jsonb_build_object('game','reflex_tap','tier',chosen.label));
    credits_balance:=payout_result.balance;
  else
    credits_balance:=stake_result.balance;
  end if;

  house_take:=target_stake_credits-payout_credits;
  if house_take > 0 then
    perform public.credit_platform_revenue('reflex_tap',house_take,'Reflex Tap round margin',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'stake',target_stake_credits,'payout',payout_credits));
  end if;

  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('reflex_tap',target_user_id,target_stake_credits,payout_credits,jsonb_build_object('tier',chosen.label,'multiplier_bp',chosen.multiplier_bp,'response_ms',target_response_ms,'false_start',coalesce(target_false_start,false))) returning id into round_id;

  tier_label:=chosen.label;multiplier_bp:=chosen.multiplier_bp;return next;
end;
$$;
revoke all on function public.play_reflex_tap_round(uuid,bigint,int,boolean,text) from public,anon,authenticated;
grant execute on function public.play_reflex_tap_round(uuid,bigint,int,boolean,text) to service_role;
