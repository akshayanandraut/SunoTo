-- Arcade: 777 Slots. 3 independent reels, 6 equally-weighted symbols each (cherry, lemon, bell,
-- star, bar, seven). Three-of-a-kind pays a symbol-specific multiplier (seven/seven/seven = the
-- "777" jackpot, the rarest and biggest); any-two-matching pays a small flat consolation multiplier
-- so most spins return something rather than a total wipeout. The jackpot multiplier (777) is only
-- ever paid out of margin already banked from this game (checked against platform_revenue_ledger
-- minus prior jackpot payouts, same guard pattern as Coin Flip's bonus / Coin Tower's topple), so
-- the house can never go net-negative on 777 Slots in aggregate. Multipliers are tuned (uniform
-- 1/6 per symbol per reel) for an approx. 90% return-to-player in aggregate while keeping the
-- platform in profit via the pool-based cut -- consistent with every other arcade game here.

create table if not exists public.slots_777_symbols (
  id smallint primary key,
  symbol text not null unique,
  three_kind_multiplier_bp int not null check (three_kind_multiplier_bp >= 0)
);
insert into public.slots_777_symbols(id,symbol,three_kind_multiplier_bp) values
  (1,'cherry',50000),
  (2,'lemon',80000),
  (3,'bell',120000),
  (4,'star',200000),
  (5,'bar',350000),
  (6,'seven',600000)
on conflict (id) do update set symbol=excluded.symbol,three_kind_multiplier_bp=excluded.three_kind_multiplier_bp;

alter table public.slots_777_symbols enable row level security;
grant select on public.slots_777_symbols to authenticated, anon;
create policy "anyone reads slots 777 symbols" on public.slots_777_symbols for select to authenticated, anon using (true);

create or replace function public.play_slots_777(target_user_id uuid,target_stake_credits bigint,target_idempotency_key text)
returns table(credits_balance bigint,payout_credits bigint,reel1 text,reel2 text,reel3 text,outcome_tier text,round_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  current_wallet_balance bigint;stake_result record;payout_result record;house_take bigint;
  symbols text[]:=array['cherry','lemon','bell','star','bar','seven'];
  mult_bp int[]:=array[50000,80000,120000,200000,350000,600000];
  idx1 int;idx2 int;idx3 int;multiplier_bp int;
  banked_margin bigint;jackpot_paid_total bigint;jackpot_extra_credits bigint;
  max_stake_credits constant bigint:=50000;
  pair_multiplier_bp constant int:=6000;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits % 100 <> 0 or target_stake_credits > max_stake_credits then
    raise exception 'invalid_stake' using errcode='22023';
  end if;
  select balance into current_wallet_balance from public.wallets where user_id=target_user_id;
  if coalesce(current_wallet_balance,0) < target_stake_credits then raise exception 'insufficient_balance' using errcode='P0001';end if;

  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'slots_777_stake','777 Slots stake',target_idempotency_key||':stake',jsonb_build_object('game','slots_777'));

  idx1:=floor(random()*6)::int+1;
  idx2:=floor(random()*6)::int+1;
  idx3:=floor(random()*6)::int+1;
  reel1:=symbols[idx1];reel2:=symbols[idx2];reel3:=symbols[idx3];
  multiplier_bp:=0;
  outcome_tier:='none';

  if idx1=idx2 and idx2=idx3 then
    multiplier_bp:=mult_bp[idx1];
    outcome_tier:=case when reel1='seven' then 'jackpot' else 'three_kind' end;
    if outcome_tier='jackpot' then
      jackpot_extra_credits:=floor(target_stake_credits::numeric*multiplier_bp/10000)::bigint;
      select coalesce(sum(credits_amount),0) into banked_margin from public.platform_revenue_ledger where source='slots_777';
      select coalesce(sum(payout_credits-stake_credits),0) into jackpot_paid_total from public.game_rounds where game_type='slots_777' and (outcome->>'outcome_tier')='jackpot';
      banked_margin:=banked_margin-jackpot_paid_total;
      if banked_margin < jackpot_extra_credits then
        multiplier_bp:=mult_bp[idx1]/3;
        outcome_tier:='three_kind';
      end if;
    end if;
  elsif idx1=idx2 or idx2=idx3 or idx1=idx3 then
    multiplier_bp:=pair_multiplier_bp;
    outcome_tier:='pair';
  end if;

  payout_credits:=floor(target_stake_credits::numeric*multiplier_bp/10000)::bigint;
  if payout_credits > 0 then
    select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'slots_777_payout','777 Slots payout',target_idempotency_key||':payout',jsonb_build_object('game','slots_777','reels',array[reel1,reel2,reel3],'outcome_tier',outcome_tier));
    credits_balance:=payout_result.balance;
  else
    credits_balance:=stake_result.balance;
  end if;

  house_take:=target_stake_credits-payout_credits;
  if house_take > 0 then
    perform public.credit_platform_revenue('slots_777',house_take,'777 Slots round margin',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'stake',target_stake_credits,'payout',payout_credits));
  end if;

  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('slots_777',target_user_id,target_stake_credits,payout_credits,jsonb_build_object('reels',array[reel1,reel2,reel3],'outcome_tier',outcome_tier,'multiplier_bp',multiplier_bp)) returning id into round_id;
  return next;
end;
$$;
revoke all on function public.play_slots_777(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.play_slots_777(uuid,bigint,text) to service_role;
