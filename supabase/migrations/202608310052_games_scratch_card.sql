-- Arcade: Scratch Card. Pick one tile from a 3x3 grid and reveal it instantly. Disclosed,
-- stake-tiered, house-favoured odds (same auditable pattern as coin_flip_tiers/coin_tower_tiers):
-- most tiles are blanks, a few are small wins, one rare tile per round is the big multiplier. The
-- big-multiplier payout is only ever paid out of margin already banked from this game (same guard
-- as Coin Flip's bonus / Coin Tower's topple / 777's jackpot), so the house can never go
-- net-negative on Scratch Card in aggregate.

create table if not exists public.scratch_card_tiers (
  id smallint primary key,
  label text not null,
  max_stake_credits bigint not null,
  small_win_probability_bp int not null check (small_win_probability_bp >= 0 and small_win_probability_bp <= 10000),
  small_win_multiplier_bp int not null check (small_win_multiplier_bp >= 0),
  big_win_probability_bp int not null check (big_win_probability_bp >= 0 and big_win_probability_bp <= 10000),
  big_win_multiplier_bp int not null check (big_win_multiplier_bp >= 10000)
);
insert into public.scratch_card_tiers(id,label,max_stake_credits,small_win_probability_bp,small_win_multiplier_bp,big_win_probability_bp,big_win_multiplier_bp) values
  (1,'Small stake',1000,2500,15000,300,80000),
  (2,'Medium stake',5000,2200,15000,200,80000),
  (3,'Large stake',50000,1800,15000,100,80000)
on conflict (id) do update set label=excluded.label,max_stake_credits=excluded.max_stake_credits,small_win_probability_bp=excluded.small_win_probability_bp,small_win_multiplier_bp=excluded.small_win_multiplier_bp,big_win_probability_bp=excluded.big_win_probability_bp,big_win_multiplier_bp=excluded.big_win_multiplier_bp;

alter table public.scratch_card_tiers enable row level security;
grant select on public.scratch_card_tiers to authenticated, anon;
create policy "anyone reads scratch card tiers" on public.scratch_card_tiers for select to authenticated, anon using (true);

create or replace function public.play_scratch_card(target_user_id uuid,target_stake_credits bigint,target_tile_index int,target_idempotency_key text)
returns table(credits_balance bigint,payout_credits bigint,tile_index int,outcome_tier text,round_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  current_wallet_balance bigint;stake_result record;payout_result record;house_take bigint;
  chosen public.scratch_card_tiers%rowtype;
  roll_small int;roll_big int;multiplier_bp int;
  banked_margin bigint;big_paid_total bigint;big_extra_credits bigint;
begin
  if target_tile_index is null or target_tile_index < 0 or target_tile_index > 8 then raise exception 'invalid_tile' using errcode='22023';end if;
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits % 100 <> 0 then raise exception 'invalid_stake' using errcode='22023';end if;
  select balance into current_wallet_balance from public.wallets where user_id=target_user_id;
  if coalesce(current_wallet_balance,0) < 10000 then raise exception 'minimum_100_sparks_required' using errcode='P0001';end if;

  select * into chosen from public.scratch_card_tiers where target_stake_credits <= max_stake_credits order by max_stake_credits asc limit 1;
  if not found then raise exception 'invalid_stake' using errcode='22023';end if;

  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'scratch_card_stake','Scratch Card stake',target_idempotency_key||':stake',jsonb_build_object('game','scratch_card','tile',target_tile_index));

  tile_index:=target_tile_index;
  outcome_tier:='none';
  multiplier_bp:=0;

  roll_big:=floor(random()*10000)::int;
  if roll_big < chosen.big_win_probability_bp then
    big_extra_credits:=floor(target_stake_credits::numeric*chosen.big_win_multiplier_bp/10000)::bigint;
    select coalesce(sum(credits_amount),0) into banked_margin from public.platform_revenue_ledger where source='scratch_card';
    select coalesce(sum(payout_credits-stake_credits),0) into big_paid_total from public.game_rounds where game_type='scratch_card' and (outcome->>'outcome_tier')='big';
    banked_margin:=banked_margin-big_paid_total;
    if banked_margin >= big_extra_credits then
      multiplier_bp:=chosen.big_win_multiplier_bp;
      outcome_tier:='big';
    end if;
  end if;
  if outcome_tier='none' then
    roll_small:=floor(random()*10000)::int;
    if roll_small < chosen.small_win_probability_bp then
      multiplier_bp:=chosen.small_win_multiplier_bp;
      outcome_tier:='small';
    end if;
  end if;

  payout_credits:=floor(target_stake_credits::numeric*multiplier_bp/10000)::bigint;
  if payout_credits > 0 then
    select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'scratch_card_payout','Scratch Card payout',target_idempotency_key||':payout',jsonb_build_object('game','scratch_card','tile',target_tile_index,'outcome_tier',outcome_tier));
    credits_balance:=payout_result.balance;
  else
    credits_balance:=stake_result.balance;
  end if;

  house_take:=target_stake_credits-payout_credits;
  if house_take > 0 then
    perform public.credit_platform_revenue('scratch_card',house_take,'Scratch Card round margin',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'stake',target_stake_credits,'payout',payout_credits));
  end if;

  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('scratch_card',target_user_id,target_stake_credits,payout_credits,jsonb_build_object('tile',target_tile_index,'outcome_tier',outcome_tier,'multiplier_bp',multiplier_bp)) returning id into round_id;
  return next;
end;
$$;
revoke all on function public.play_scratch_card(uuid,bigint,int,text) from public,anon,authenticated;
grant execute on function public.play_scratch_card(uuid,bigint,int,text) to service_role;
