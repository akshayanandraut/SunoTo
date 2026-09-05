-- Party Room "Dragon Tiger" staking. Same pari-mutuel model as Andar Bahar: each seated player bets a
-- fixed stake on Dragon or Tiger during a betting window, the dealer reveals one card to each side
-- (server-authoritative, worker/src/policies/dragonTigerEngine.js), and the higher card wins. Winners
-- split the ENTIRE pot proportionally to their own stake, minus a disclosed 10% house rake. On a tie
-- (equal rank), all stakes are refunded in full rather than pushed to the house -- a tie is not a
-- "nobody bet on the winning side" case, it is a no-contest round. Free (stakeCredits = 0) rounds
-- bypass these RPCs.

create or replace function public.games_daily_stake_credits(target_user_id uuid)
returns bigint
language sql security definer set search_path = '' stable as $$
  select coalesce(sum(-delta),0)::bigint
  from public.wallet_ledger
  where user_id = target_user_id
    and entry_type in ('wheel_stake','jackpot_ticket','trivia_entry','snake_ladder_stake','rummy_stake','ludo_stake','teen_patti_stake','andar_bahar_stake','dragon_tiger_stake')
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.games_daily_stake_credits(uuid) from public,anon,authenticated;
grant execute on function public.games_daily_stake_credits(uuid) to service_role;

create or replace function public.stake_dragon_tiger_round(target_user_id uuid,target_stake_credits bigint,target_room_id text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare stake_result record;daily_stake_cap constant bigint := 200000;max_single_stake constant bigint := 50000;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits > max_single_stake then raise exception 'invalid_stake' using errcode='22023';end if;
  if public.games_daily_stake_credits(target_user_id) + target_stake_credits > daily_stake_cap then raise exception 'daily_stake_cap_reached' using errcode='P0001';end if;
  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'dragon_tiger_stake','Dragon Tiger bet',target_idempotency_key,jsonb_build_object('game','dragon_tiger','room_id',target_room_id));
  balance:=stake_result.balance;return next;
end;
$$;
revoke all on function public.stake_dragon_tiger_round(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.stake_dragon_tiger_round(uuid,bigint,text,text) to service_role;

create or replace function public.refund_dragon_tiger_stake(target_user_id uuid,target_stake_credits bigint,target_room_id text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare refund_result record;
begin
  select * into refund_result from public.apply_wallet_entry(target_user_id,target_stake_credits,'dragon_tiger_refund','Dragon Tiger bet refund',target_idempotency_key,jsonb_build_object('game','dragon_tiger','room_id',target_room_id));
  balance:=refund_result.balance;return next;
end;
$$;
revoke all on function public.refund_dragon_tiger_stake(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.refund_dragon_tiger_stake(uuid,bigint,text,text) to service_role;

create or replace function public.settle_dragon_tiger_payout(target_user_id uuid,target_stake_credits bigint,target_payout_credits bigint,target_room_id text,target_winning_side text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare payout_result record;
begin
  if target_payout_credits is null or target_payout_credits <= 0 then raise exception 'invalid_payout' using errcode='22023';end if;
  select * into payout_result from public.apply_wallet_entry(target_user_id,target_payout_credits,'dragon_tiger_payout','Dragon Tiger winnings',target_idempotency_key,jsonb_build_object('game','dragon_tiger','room_id',target_room_id));
  balance:=payout_result.balance;
  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('dragon_tiger',target_user_id,target_stake_credits,target_payout_credits,jsonb_build_object('room_id',target_room_id,'winning_side',target_winning_side));
  return next;
end;
$$;
revoke all on function public.settle_dragon_tiger_payout(uuid,bigint,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.settle_dragon_tiger_payout(uuid,bigint,bigint,text,text,text) to service_role;

create or replace function public.record_dragon_tiger_house_take(target_room_id text,target_house_take_credits bigint,target_pot_credits bigint,target_winning_side text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if target_house_take_credits > 0 then
    perform public.credit_platform_revenue('dragon_tiger',target_house_take_credits,'Dragon Tiger round rake',target_room_id||':'||clock_timestamp()::text,jsonb_build_object('room_id',target_room_id,'pot',target_pot_credits,'winning_side',target_winning_side));
  end if;
end;
$$;
revoke all on function public.record_dragon_tiger_house_take(text,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.record_dragon_tiger_house_take(text,bigint,bigint,text) to service_role;
