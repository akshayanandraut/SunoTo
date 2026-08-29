-- Per-user daily stake/entry cap across all games, so one user can never lose more than a fixed,
-- disclosed amount of Credits per day even by playing every game repeatedly. This is on top of the
-- existing per-request limits (max stake per wheel spin, max tickets per jackpot purchase, one
-- trivia entry per round) -- it caps the *sum* across a rolling UTC calendar day.
-- Cap: 200000 Credits/day (2000 Sparks) per user. Same constant reused everywhere so the limit is
-- consistent and can't be bypassed by mixing games.

create or replace function public.games_daily_stake_credits(target_user_id uuid)
returns bigint
language sql security definer set search_path = '' stable as $$
  select coalesce(sum(-delta),0)::bigint
  from public.wallet_ledger
  where user_id = target_user_id
    and entry_type in ('wheel_stake','jackpot_ticket','trivia_entry')
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke all on function public.games_daily_stake_credits(uuid) from public,anon,authenticated;
grant execute on function public.games_daily_stake_credits(uuid) to service_role;

create or replace function public.play_wheel_spin(target_user_id uuid,target_stake_credits bigint,target_idempotency_key text)
returns table(credits_balance bigint,payout_credits bigint,segment_label text,multiplier_bp int,round_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  daily_stake_cap constant bigint := 200000;
  current_wallet_balance bigint;
  roll int;
  cumulative int;
  chosen public.wheel_segments%rowtype;
  stake_result record;
  payout_result record;
  house_take bigint;
begin
  if target_stake_credits is null or target_stake_credits <= 0 or target_stake_credits % 100 <> 0 then raise exception 'invalid_stake' using errcode='22023';end if;
  select balance into current_wallet_balance from public.wallets where user_id=target_user_id;
  if coalesce(current_wallet_balance,0) < 10000 then raise exception 'minimum_100_sparks_required' using errcode='P0001';end if;
  if public.games_daily_stake_credits(target_user_id) + target_stake_credits > daily_stake_cap then raise exception 'daily_stake_cap_reached' using errcode='P0001';end if;
  select * into stake_result from public.apply_wallet_entry(target_user_id,-target_stake_credits,'wheel_stake','Wheel of Fortune spin',target_idempotency_key||':stake',jsonb_build_object('game','wheel'));

  roll:=floor(random()*10000)::int;
  cumulative:=0;
  for chosen in select * from public.wheel_segments order by id loop
    cumulative:=cumulative+chosen.weight_bp;
    exit when roll < cumulative;
  end loop;

  payout_credits:=floor(target_stake_credits::numeric*chosen.multiplier_bp/10000)::bigint;
  if payout_credits > 0 then
    select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'wheel_payout','Wheel of Fortune payout',target_idempotency_key||':payout',jsonb_build_object('game','wheel','segment',chosen.label));
    credits_balance:=payout_result.balance;
  else
    credits_balance:=stake_result.balance;
  end if;

  house_take:=target_stake_credits-payout_credits;
  if house_take > 0 then
    perform public.credit_platform_revenue('wheel',house_take,'Wheel of Fortune round margin',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'stake',target_stake_credits,'payout',payout_credits));
  end if;

  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('wheel',target_user_id,target_stake_credits,payout_credits,jsonb_build_object('segment',chosen.label,'multiplier_bp',chosen.multiplier_bp,'roll',roll)) returning id into round_id;

  segment_label:=chosen.label;multiplier_bp:=chosen.multiplier_bp;return next;
end;
$$;
revoke all on function public.play_wheel_spin(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.play_wheel_spin(uuid,bigint,text) to service_role;

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
  if target_ticket_count is null or target_ticket_count <= 0 or target_ticket_count > 100 then raise exception 'invalid_ticket_count' using errcode='22023';end if;
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

create or replace function public.submit_trivia_entry(target_user_id uuid,target_answers jsonb,target_response_ms bigint,target_idempotency_key text)
returns table(round_id bigint,correct_count int,credits_balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  daily_stake_cap constant bigint := 200000;
  current_round public.daily_trivia_rounds%rowtype;
  wallet_result record;
  question jsonb;
  idx int := 0;
  correct int := 0;
  answer_value int;
begin
  if target_response_ms is null or target_response_ms < 0 then raise exception 'invalid_response_time' using errcode='22023'; end if;
  current_round := public.get_or_create_open_trivia_round();
  if current_round.closes_at <= now() then raise exception 'round_closed' using errcode='22023'; end if;
  if exists(select 1 from public.daily_trivia_entries where round_id = current_round.id and user_id = target_user_id) then
    raise exception 'already_submitted' using errcode='22023';
  end if;
  if jsonb_array_length(target_answers) <> jsonb_array_length(current_round.questions) then raise exception 'invalid_answers' using errcode='22023'; end if;
  if public.games_daily_stake_credits(target_user_id) + current_round.entry_credits > daily_stake_cap then raise exception 'daily_stake_cap_reached' using errcode='P0001'; end if;

  for question in select * from jsonb_array_elements(current_round.questions) loop
    answer_value := (target_answers->idx)::int;
    if answer_value = (question->>'correct_index')::int then correct := correct + 1; end if;
    idx := idx + 1;
  end loop;

  select * into wallet_result from public.apply_wallet_entry(target_user_id,-current_round.entry_credits,'trivia_entry','Daily Trivia entry',target_idempotency_key,jsonb_build_object('round_id',current_round.id));

  insert into public.daily_trivia_entries(round_id,user_id,answers,correct_count,response_ms,credits_paid)
    values(current_round.id,target_user_id,target_answers,correct,target_response_ms,current_round.entry_credits);
  update public.daily_trivia_rounds set entrant_count = entrant_count + 1, pool_credits = pool_credits + current_round.entry_credits where id = current_round.id;

  round_id := current_round.id; correct_count := correct; credits_balance := wallet_result.balance;
  return next;
end;
$$;
revoke all on function public.submit_trivia_entry(uuid,jsonb,bigint,text) from public,anon,authenticated;
grant execute on function public.submit_trivia_entry(uuid,jsonb,bigint,text) to service_role;
