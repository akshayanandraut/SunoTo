-- Jackpot raffle: real tickets, real draw, disclosed odds and payout split. No fake users, no rigging.
-- Ticket price and payout split are fixed, disclosed constants (not tunable per-round, so they
-- can never be secretly adjusted to manipulate an individual round's outcome).
-- Ticket price: 100 Credits (1 Spark). Payout split: 70% of the pool to the winner, 30% house rake.

create table if not exists public.jackpot_rounds (
  id bigint generated always as identity primary key,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open','drawn')),
  total_tickets bigint not null default 0 check (total_tickets >= 0),
  pool_credits bigint not null default 0 check (pool_credits >= 0),
  winner_user_id uuid references auth.users(id),
  payout_credits bigint,
  house_take_credits bigint,
  drawn_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists jackpot_rounds_status_idx on public.jackpot_rounds(status, closes_at);

create table if not exists public.jackpot_tickets (
  id bigint generated always as identity primary key,
  round_id bigint not null references public.jackpot_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_count bigint not null check (ticket_count > 0),
  credits_spent bigint not null check (credits_spent > 0),
  created_at timestamptz not null default now(),
  unique (round_id, user_id)
);

alter table public.jackpot_rounds enable row level security;
alter table public.jackpot_tickets enable row level security;
revoke all on public.jackpot_rounds from anon, authenticated;
revoke all on public.jackpot_tickets from anon, authenticated;
grant select on public.jackpot_rounds to authenticated, anon;
grant select on public.jackpot_tickets to authenticated;
create policy "anyone reads jackpot rounds" on public.jackpot_rounds for select to authenticated, anon using (true);
create policy "users read own jackpot tickets" on public.jackpot_tickets for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.get_or_create_open_jackpot_round()
returns public.jackpot_rounds
language plpgsql security definer set search_path = '' as $$
declare current_round public.jackpot_rounds%rowtype;
begin
  select * into current_round from public.jackpot_rounds where status='open' and closes_at>now() order by id desc limit 1 for update skip locked;
  if current_round.id is not null then return current_round;end if;
  insert into public.jackpot_rounds(opens_at,closes_at) values(now(),now()+interval '24 hours') returning * into current_round;
  return current_round;
end;
$$;
revoke all on function public.get_or_create_open_jackpot_round() from public,anon,authenticated;
grant execute on function public.get_or_create_open_jackpot_round() to service_role;

create or replace function public.buy_jackpot_tickets(target_user_id uuid,target_ticket_count int,target_idempotency_key text)
returns table(round_id bigint,tickets_owned bigint,credits_balance bigint,closes_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  ticket_price constant bigint := 100;
  current_round public.jackpot_rounds%rowtype;
  cost bigint;
  wallet_result record;
  existing_ticket public.jackpot_tickets%rowtype;
begin
  if target_ticket_count is null or target_ticket_count <= 0 or target_ticket_count > 100 then raise exception 'invalid_ticket_count' using errcode='22023';end if;
  current_round := public.get_or_create_open_jackpot_round();
  cost := target_ticket_count * ticket_price;
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

-- Real, provably-weighted draw: winner probability = their ticket_count / total_tickets, exactly.
create or replace function public.draw_jackpot_round(target_round_id bigint)
returns table(winner_user_id uuid,payout_credits bigint,total_tickets bigint)
language plpgsql security definer set search_path = '' as $$
declare
  payout_bp constant int := 7000;
  current_round public.jackpot_rounds%rowtype;
  roll bigint;
  cumulative bigint;
  ticket public.jackpot_tickets%rowtype;
  chosen_user uuid;
  house_take bigint;
  wallet_result record;
begin
  select * into current_round from public.jackpot_rounds where id=target_round_id and status='open' for update;
  if current_round.id is null then raise exception 'round_not_open' using errcode='22023';end if;
  if current_round.closes_at > now() then raise exception 'round_not_closed_yet' using errcode='22023';end if;

  if current_round.total_tickets = 0 then
    update public.jackpot_rounds set status='drawn',payout_credits=0,house_take_credits=0,drawn_at=now() where id=target_round_id;
    winner_user_id:=null;payout_credits:=0;total_tickets:=0;return next;return;
  end if;

  roll:=floor(random()*current_round.total_tickets)::bigint;
  cumulative:=0;
  for ticket in select * from public.jackpot_tickets where round_id=target_round_id order by id loop
    cumulative:=cumulative+ticket.ticket_count;
    if roll < cumulative then chosen_user:=ticket.user_id;exit;end if;
  end loop;

  payout_credits:=floor(current_round.pool_credits::numeric*payout_bp/10000)::bigint;
  house_take:=current_round.pool_credits-payout_credits;

  select * into wallet_result from public.apply_wallet_entry(chosen_user,payout_credits,'jackpot_payout','Jackpot round win','jackpot-payout:'||target_round_id,jsonb_build_object('round_id',target_round_id));
  if house_take > 0 then
    perform public.credit_platform_revenue('jackpot',house_take,'Jackpot round margin','jackpot-revenue:'||target_round_id,jsonb_build_object('round_id',target_round_id));
  end if;

  update public.jackpot_rounds set status='drawn',winner_user_id=chosen_user,payout_credits=payout_credits,house_take_credits=house_take,drawn_at=now() where id=target_round_id;
  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('jackpot',chosen_user,100,payout_credits,jsonb_build_object('round_id',target_round_id,'total_tickets',current_round.total_tickets,'pool_credits',current_round.pool_credits));

  winner_user_id:=chosen_user;total_tickets:=current_round.total_tickets;return next;
end;
$$;
revoke all on function public.draw_jackpot_round(bigint) from public,anon,authenticated;
grant execute on function public.draw_jackpot_round(bigint) to service_role;
