-- Sparks Pool (formerly "Jackpot"): remove the artificial per-purchase ticket cap.
-- User does not want a cap on how much they can spend on tickets; the existing daily
-- play cap (games_daily_stake_credits vs daily_stake_cap) remains the real safety net.
create or replace function public.buy_jackpot_tickets(target_user_id uuid,target_ticket_count int,target_idempotency_key text)
returns table(round_id bigint,tickets_owned bigint,credits_balance bigint,closes_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  daily_stake_cap constant bigint := 200000;
  ticket_price constant bigint := 100;
  current_round public.jackpot_rounds%rowtype;
  cost bigint;
  wallet_result record;
  existing_ticket public.jackpot_tickets%rowtype;
begin
  if target_ticket_count is null or target_ticket_count <= 0 then raise exception 'invalid_ticket_count' using errcode='22023';end if;
  cost := target_ticket_count * ticket_price;
  if public.games_daily_stake_credits(target_user_id) + cost > daily_stake_cap then raise exception 'daily_stake_cap_reached' using errcode='P0001';end if;
  current_round := public.get_or_create_open_jackpot_round();
  select * into wallet_result from public.apply_wallet_entry(target_user_id,-cost,'jackpot_ticket','Jackpot ticket purchase',target_idempotency_key,jsonb_build_object('round_id',current_round.id,'ticket_count',target_ticket_count));

  insert into public.jackpot_tickets(round_id,user_id,ticket_count,credits_spent) values(current_round.id,target_user_id,target_ticket_count,cost)
    on conflict (round_id,user_id) do update set ticket_count=public.jackpot_tickets.ticket_count+excluded.ticket_count,credits_spent=public.jackpot_tickets.credits_spent+excluded.credits_spent
    returning * into existing_ticket;
  update public.jackpot_rounds set total_tickets=total_tickets+target_ticket_count,pool_credits=pool_credits+cost where id=current_round.id;

  round_id:=current_round.id;tickets_owned:=existing_ticket.ticket_count;credits_balance:=wallet_result.balance;closes_at:=current_round.closes_at;return next;
end;
$$;
revoke all on function public.buy_jackpot_tickets(uuid,int,text) from public,anon,authenticated;
grant execute on function public.buy_jackpot_tickets(uuid,int,text) to service_role;
