-- Party Room "Blind Auction" (Bidding Game). Every seated player who wants in privately submits their
-- own sealed bid in Sparks/Credits during a betting window -- your bid IS your stake, debited immediately
-- regardless of outcome, same as Andar Bahar's bet-time debit. When the window closes, the HIGHEST bid
-- that is UNIQUE among all bids wins the whole pot (all bids combined) minus a disclosed 10% house rake.
-- If every bid ties (no unique highest exists), it's a push: everyone is refunded in full, no rake taken.
-- No card/dice randomness -- purely a game-theory/nerve skill game (classic "unique bid auction").

create or replace function public.games_daily_stake_credits(target_user_id uuid)
returns bigint
language sql security definer set search_path = '' stable as $$
  select coalesce(sum(-delta),0)::bigint
  from public.wallet_ledger
  where user_id = target_user_id
    and entry_type in ('wheel_stake','jackpot_ticket','trivia_entry','snake_ladder_stake','rummy_stake','ludo_stake','teen_patti_stake','andar_bahar_stake','dragon_tiger_stake','bidding_stake')
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.games_daily_stake_credits(uuid) from public,anon,authenticated;
grant execute on function public.games_daily_stake_credits(uuid) to service_role;

create or replace function public.stake_bidding_round(target_user_id uuid,target_stake_credits bigint,target_room_id text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare stake_result record;daily_stake_cap constant bigint := 200000;max_single_stake constant bigint := 50000;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits > max_single_stake then raise exception 'invalid_stake' using errcode='22023';end if;
  if public.games_daily_stake_credits(target_user_id) + target_stake_credits > daily_stake_cap then raise exception 'daily_stake_cap_reached' using errcode='P0001';end if;
  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'bidding_stake','Blind Auction bid',target_idempotency_key,jsonb_build_object('game','bidding','room_id',target_room_id));
  balance:=stake_result.balance;return next;
end;
$$;
revoke all on function public.stake_bidding_round(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.stake_bidding_round(uuid,bigint,text,text) to service_role;

create or replace function public.refund_bidding_stake(target_user_id uuid,target_stake_credits bigint,target_room_id text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare refund_result record;
begin
  select * into refund_result from public.apply_wallet_entry(target_user_id,target_stake_credits,'bidding_refund','Blind Auction bid refund',target_idempotency_key,jsonb_build_object('game','bidding','room_id',target_room_id));
  balance:=refund_result.balance;return next;
end;
$$;
revoke all on function public.refund_bidding_stake(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.refund_bidding_stake(uuid,bigint,text,text) to service_role;

create or replace function public.settle_bidding_payout(target_user_id uuid,target_stake_credits bigint,target_payout_credits bigint,target_room_id text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare payout_result record;
begin
  if target_payout_credits is null or target_payout_credits <= 0 then raise exception 'invalid_payout' using errcode='22023';end if;
  select * into payout_result from public.apply_wallet_entry(target_user_id,target_payout_credits,'bidding_payout','Blind Auction winnings',target_idempotency_key,jsonb_build_object('game','bidding','room_id',target_room_id));
  balance:=payout_result.balance;
  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('bidding',target_user_id,target_stake_credits,target_payout_credits,jsonb_build_object('room_id',target_room_id));
  return next;
end;
$$;
revoke all on function public.settle_bidding_payout(uuid,bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function public.settle_bidding_payout(uuid,bigint,bigint,text,text) to service_role;

create or replace function public.record_bidding_house_take(target_room_id text,target_house_take_credits bigint,target_pot_credits bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if target_house_take_credits > 0 then
    perform public.credit_platform_revenue('bidding',target_house_take_credits,'Blind Auction round rake',target_room_id||':'||clock_timestamp()::text,jsonb_build_object('room_id',target_room_id,'pot',target_pot_credits));
  end if;
end;
$$;
revoke all on function public.record_bidding_house_take(text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.record_bidding_house_take(text,bigint,bigint) to service_role;
