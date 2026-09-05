-- play_roulette_spin is declared `returns table(...)` and assigns all OUT parameters, but never
-- calls `return next` -- so PostgREST always got back zero rows (an empty array), and the worker's
-- `data[0]` was undefined, which JSON.stringify()'d into the literal text "undefined" in the
-- response body. Add the missing `return next` so the function actually emits its result row.
create or replace function public.play_roulette_spin(target_user_id uuid,target_stake_credits bigint,target_bet_type text,target_bet_value int,target_idempotency_key text)
returns table(credits_balance bigint,payout_credits bigint,result_number int,result_color text,round_id bigint)
language plpgsql security definer set search_path = '' as $$
declare current_wallet_balance bigint;stake_result record;payout_result record;house_take bigint;
  red_numbers constant int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  roll int;multiplier_bp int := 0;max_stake constant bigint := 50000;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits % 100 <> 0 or target_stake_credits > max_stake then raise exception 'invalid_stake' using errcode='22023';end if;
  select balance into current_wallet_balance from public.wallets where user_id=target_user_id;
  if coalesce(current_wallet_balance,0) < 10000 then raise exception 'minimum_100_sparks_required' using errcode='P0001';end if;
  if target_bet_type='number' then
    if target_bet_value is null or target_bet_value < 0 or target_bet_value > 36 then raise exception 'invalid_bet' using errcode='22023';end if;
  elsif target_bet_type in ('red','black','odd','even','low','high') then null;
  elsif target_bet_type in ('dozen','column') then
    if target_bet_value is null or target_bet_value not in (1,2,3) then raise exception 'invalid_bet' using errcode='22023';end if;
  else raise exception 'invalid_bet' using errcode='22023';end if;

  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'roulette_stake','Roulette spin',target_idempotency_key||':stake',jsonb_build_object('game','roulette','bet_type',target_bet_type,'bet_value',target_bet_value));

  roll:=floor(random()*37)::int;
  result_number:=roll;
  result_color:=case when roll=0 then 'green' when roll=any(red_numbers) then 'red' else 'black' end;

  if target_bet_type='number' and target_bet_value=roll then multiplier_bp:=350000;
  elsif target_bet_type='red' and result_color='red' then multiplier_bp:=10000;
  elsif target_bet_type='black' and result_color='black' then multiplier_bp:=10000;
  elsif target_bet_type='odd' and roll<>0 and roll%2=1 then multiplier_bp:=10000;
  elsif target_bet_type='even' and roll<>0 and roll%2=0 then multiplier_bp:=10000;
  elsif target_bet_type='low' and roll between 1 and 18 then multiplier_bp:=10000;
  elsif target_bet_type='high' and roll between 19 and 36 then multiplier_bp:=10000;
  elsif target_bet_type='dozen' and roll<>0 and ceil(roll/12.0)=target_bet_value then multiplier_bp:=20000;
  elsif target_bet_type='column' and roll<>0 and ((roll-1)%3)+1=target_bet_value then multiplier_bp:=20000;
  else multiplier_bp:=0;end if;

  payout_credits:=floor(target_stake_credits::numeric*multiplier_bp/10000)::bigint;
  if payout_credits > 0 then
    select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'roulette_payout','Roulette payout',target_idempotency_key||':payout',jsonb_build_object('game','roulette','result_number',roll));
    credits_balance:=payout_result.balance;
  else
    credits_balance:=stake_result.balance;
  end if;

  house_take:=target_stake_credits-payout_credits;
  if house_take > 0 then
    perform public.credit_platform_revenue('roulette',house_take,'Roulette round margin',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'stake',target_stake_credits,'payout',payout_credits));
  end if;

  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('roulette',target_user_id,target_stake_credits,payout_credits,jsonb_build_object('bet_type',target_bet_type,'bet_value',target_bet_value,'result_number',roll,'result_color',result_color)) returning id into round_id;
  return next;
end;
$$;
revoke all on function public.play_roulette_spin(uuid,bigint,text,int,text) from public,anon,authenticated;
grant execute on function public.play_roulette_spin(uuid,bigint,text,int,text) to service_role;
