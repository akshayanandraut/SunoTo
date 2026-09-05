-- Party Room "Snake & Ladder" staking. Uses the same Credits wallet/ledger and platform_revenue_ledger
-- as the Wheel/Jackpot/Trivia games (see 202608270021_games_wheel.sql). Distinct from those in that a
-- round is multiplayer: every joining player stakes into a shared pot, and the single winner (whoever
-- reaches square 100 first) takes the pot minus a disclosed 10% house rake. Only registered users with
-- a wallet may join a staked round; free (stakeCredits = 0) rounds bypass these RPCs entirely and are
-- resolved purely inside the PartyRoomShard Durable Object.

-- Reuses the shared cross-game daily cap (200000 Credits/day/user, see 202608270024_games_daily_stake_cap.sql).
-- Re-declaring games_daily_stake_credits here to add 'snake_ladder_stake' to the counted entry types --
-- Postgres requires the whole function body on every create-or-replace, not just the delta.
create or replace function public.games_daily_stake_credits(target_user_id uuid)
returns bigint
language sql security definer set search_path = '' stable as $$
  select coalesce(sum(-delta),0)::bigint
  from public.wallet_ledger
  where user_id = target_user_id
    and entry_type in ('wheel_stake','jackpot_ticket','trivia_entry','snake_ladder_stake')
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.games_daily_stake_credits(uuid) from public,anon,authenticated;
grant execute on function public.games_daily_stake_credits(uuid) to service_role;

create or replace function public.stake_snake_ladder_round(target_user_id uuid,target_stake_credits bigint,target_room_id text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare stake_result record;daily_stake_cap constant bigint := 200000;max_single_stake constant bigint := 50000;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits > max_single_stake then raise exception 'invalid_stake' using errcode='22023';end if;
  if public.games_daily_stake_credits(target_user_id) + target_stake_credits > daily_stake_cap then raise exception 'daily_stake_cap_reached' using errcode='P0001';end if;
  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'snake_ladder_stake','Snake & Ladder stake',target_idempotency_key,jsonb_build_object('game','snake_ladder','room_id',target_room_id));
  balance:=stake_result.balance;return next;
end;
$$;
revoke all on function public.stake_snake_ladder_round(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.stake_snake_ladder_round(uuid,bigint,text,text) to service_role;

-- If staking every player in the round fails partway through (e.g. player 3 of 4 lacks enough
-- Credits), players already staked must get their Credits back rather than losing them for a game
-- that never starts.
create or replace function public.refund_snake_ladder_stake(target_user_id uuid,target_stake_credits bigint,target_room_id text,target_idempotency_key text)
returns table(balance bigint)
language plpgsql security definer set search_path = '' as $$
declare refund_result record;
begin
  select * into refund_result from public.apply_wallet_entry(target_user_id,target_stake_credits,'snake_ladder_refund','Snake & Ladder stake refund',target_idempotency_key,jsonb_build_object('game','snake_ladder','room_id',target_room_id));
  balance:=refund_result.balance;return next;
end;
$$;
revoke all on function public.refund_snake_ladder_stake(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.refund_snake_ladder_stake(uuid,bigint,text,text) to service_role;

create or replace function public.settle_snake_ladder_round(target_winner_user_id uuid,target_pot_credits bigint,target_room_id text,target_participant_ids jsonb,target_idempotency_key text)
returns table(balance bigint,payout_credits bigint)
language plpgsql security definer set search_path = '' as $$
declare payout_result record;house_take bigint;
begin
  if target_pot_credits is null or target_pot_credits <= 0 then raise exception 'invalid_pot' using errcode='22023';end if;
  payout_credits:=floor(target_pot_credits::numeric*(10000-1000)/10000)::bigint;
  select * into payout_result from public.apply_wallet_entry(target_winner_user_id,payout_credits,'snake_ladder_payout','Snake & Ladder winnings',target_idempotency_key||':payout',jsonb_build_object('game','snake_ladder','room_id',target_room_id,'pot',target_pot_credits));
  balance:=payout_result.balance;
  house_take:=target_pot_credits-payout_credits;
  if house_take > 0 then
    perform public.credit_platform_revenue('snake_ladder',house_take,'Snake & Ladder round rake',target_idempotency_key||':revenue',jsonb_build_object('room_id',target_room_id,'winner',target_winner_user_id,'pot',target_pot_credits));
  end if;
  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('snake_ladder',target_winner_user_id,target_pot_credits,payout_credits,jsonb_build_object('room_id',target_room_id,'participants',target_participant_ids));
end;
$$;
revoke all on function public.settle_snake_ladder_round(uuid,bigint,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.settle_snake_ladder_round(uuid,bigint,text,jsonb,text) to service_role;
