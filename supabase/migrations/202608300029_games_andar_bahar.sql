-- Party Room "Andar Bahar" staking. Unlike the other staked games, this is pari-mutuel, not a shared
-- pot won outright by one player: each seated player bets a fixed stake on Andar or Bahar during a
-- betting window, then the dealer reveals cards until the middle card's rank repeats (server-authoritative,
-- worker/src/policies/andarBaharEngine.js). Winners on the correct side split the ENTIRE pot (both sides'
-- stakes combined) proportionally to their own stake, minus a disclosed 10% house rake. If nobody bet on
-- the winning side, no payouts occur and the platform keeps the pot -- same as a real casino table where
-- the house implicitly holds the other side. Free (stakeCredits = 0) rounds bypass these RPCs.

create or replace function public.games_daily_stake_credits(target_user_id uuid)
returns bigint
language sql security definer set search_path = '' stable as $$
  select coalesce(sum(-delta),0)::bigint
  from public.wallet_ledger
  where user_id = target_user_id
    and entry_type in ('wheel_stake','jackpot_ticket','trivia_entry','snake_ladder_stake','rummy_stake','ludo_stake','teen_patti_stake','andar_bahar_stake')
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.games_daily_stake_credits(uuid) from public,anon,authenticated;
grant execute on function public.games_daily_stake_credits(uuid) to service_role;

create or replace function public.stake_andar_bahar_round(target_user_id uuid,target_stake_credits bigint,target_room_id text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare stake_result record;daily_stake_cap constant bigint := 200000;max_single_stake constant bigint := 50000;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits > max_single_stake then raise exception 'invalid_stake' using errcode='22023';end if;
  if public.games_daily_stake_credits(target_user_id) + target_stake_credits > daily_stake_cap then raise exception 'daily_stake_cap_reached' using errcode='P0001';end if;
  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'andar_bahar_stake','Andar Bahar bet',target_idempotency_key,jsonb_build_object('game','andar_bahar','room_id',target_room_id));
  balance:=stake_result.balance;return next;
end;
$$;
revoke all on function public.stake_andar_bahar_round(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.stake_andar_bahar_round(uuid,bigint,text,text) to service_role;

create or replace function public.refund_andar_bahar_stake(target_user_id uuid,target_stake_credits bigint,target_room_id text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare refund_result record;
begin
  select * into refund_result from public.apply_wallet_entry(target_user_id,target_stake_credits,'andar_bahar_refund','Andar Bahar bet refund',target_idempotency_key,jsonb_build_object('game','andar_bahar','room_id',target_room_id));
  balance:=refund_result.balance;return next;
end;
$$;
revoke all on function public.refund_andar_bahar_stake(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.refund_andar_bahar_stake(uuid,bigint,text,text) to service_role;

create or replace function public.settle_andar_bahar_payout(target_user_id uuid,target_stake_credits bigint,target_payout_credits bigint,target_room_id text,target_winning_side text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare payout_result record;
begin
  if target_payout_credits is null or target_payout_credits <= 0 then raise exception 'invalid_payout' using errcode='22023';end if;
  select * into payout_result from public.apply_wallet_entry(target_user_id,target_payout_credits,'andar_bahar_payout','Andar Bahar winnings',target_idempotency_key,jsonb_build_object('game','andar_bahar','room_id',target_room_id));
  balance:=payout_result.balance;
  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('andar_bahar',target_user_id,target_stake_credits,target_payout_credits,jsonb_build_object('room_id',target_room_id,'winning_side',target_winning_side));
  return next;
end;
$$;
revoke all on function public.settle_andar_bahar_payout(uuid,bigint,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.settle_andar_bahar_payout(uuid,bigint,bigint,text,text,text) to service_role;

create or replace function public.record_andar_bahar_house_take(target_room_id text,target_house_take_credits bigint,target_pot_credits bigint,target_winning_side text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if target_house_take_credits > 0 then
    perform public.credit_platform_revenue('andar_bahar',target_house_take_credits,'Andar Bahar round rake',target_room_id||':'||clock_timestamp()::text,jsonb_build_object('room_id',target_room_id,'pot',target_pot_credits,'winning_side',target_winning_side));
  end if;
end;
$$;
revoke all on function public.record_andar_bahar_house_take(text,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.record_andar_bahar_house_take(text,bigint,bigint,text) to service_role;
