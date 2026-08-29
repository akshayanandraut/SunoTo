-- Daily Trivia: skill-based, no randomness in payout. Entry fee funds the pool; ranking is by
-- correct answers then response time; the payout pool (70% of stakes) is split across ranks by a
-- fixed, disclosed tier table. The platform's 30% rake is skimmed from real stakes only, same as
-- Wheel/Jackpot -- no round is ever funded from anywhere else, so the house can never lose.

create table if not exists public.daily_trivia_rounds (
  id bigint generated always as identity primary key,
  trivia_date date not null unique,
  questions jsonb not null,
  entry_credits bigint not null default 100 check (entry_credits > 0),
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open','settled')),
  entrant_count bigint not null default 0 check (entrant_count >= 0),
  pool_credits bigint not null default 0 check (pool_credits >= 0),
  payout_credits bigint,
  house_take_credits bigint,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists daily_trivia_rounds_status_idx on public.daily_trivia_rounds(status, closes_at);

create table if not exists public.daily_trivia_entries (
  id bigint generated always as identity primary key,
  round_id bigint not null references public.daily_trivia_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null,
  correct_count int not null,
  response_ms bigint not null check (response_ms >= 0),
  credits_paid bigint not null check (credits_paid > 0),
  rank int,
  payout_credits bigint not null default 0 check (payout_credits >= 0),
  created_at timestamptz not null default now(),
  unique (round_id, user_id)
);
create index if not exists daily_trivia_entries_round_score_idx on public.daily_trivia_entries(round_id, correct_count desc, response_ms asc);

alter table public.daily_trivia_rounds enable row level security;
alter table public.daily_trivia_entries enable row level security;
revoke all on public.daily_trivia_rounds from anon, authenticated;
revoke all on public.daily_trivia_entries from anon, authenticated;
grant select on public.daily_trivia_rounds to authenticated, anon;
grant select on public.daily_trivia_entries to authenticated;
create policy "anyone reads trivia rounds" on public.daily_trivia_rounds for select to authenticated, anon using (true);
create policy "users read own trivia entries" on public.daily_trivia_entries for select to authenticated using ((select auth.uid()) = user_id);

-- Fixed daily question set for the MVP; swapping to a rotating bank is a follow-up, not a blocker.
create or replace function public.get_or_create_open_trivia_round()
returns public.daily_trivia_rounds
language plpgsql security definer set search_path = '' as $$
declare
  current_round public.daily_trivia_rounds%rowtype;
  today date := (now() at time zone 'utc')::date;
  default_questions constant jsonb := '[
    {"question":"Which city is the capital of India?","options":["Mumbai","New Delhi","Kolkata","Chennai"],"correct_index":1},
    {"question":"What is 12 x 8?","options":["96","86","106","88"],"correct_index":0},
    {"question":"Which planet is known as the Red Planet?","options":["Venus","Jupiter","Mars","Saturn"],"correct_index":2},
    {"question":"Who wrote the Indian national anthem?","options":["Rabindranath Tagore","Bankim Chandra Chattopadhyay","Sarojini Naidu","Muhammad Iqbal"],"correct_index":0},
    {"question":"How many players are on a cricket team on the field?","options":["10","11","12","9"],"correct_index":1}
  ]'::jsonb;
begin
  select * into current_round from public.daily_trivia_rounds where trivia_date = today for update skip locked;
  if current_round.id is not null then return current_round; end if;
  insert into public.daily_trivia_rounds(trivia_date, questions, opens_at, closes_at)
    values(today, default_questions, now(), (today + 1)::timestamptz)
    on conflict (trivia_date) do update set trivia_date = excluded.trivia_date
    returning * into current_round;
  return current_round;
end;
$$;
revoke all on function public.get_or_create_open_trivia_round() from public,anon,authenticated;
grant execute on function public.get_or_create_open_trivia_round() to service_role;

create or replace function public.submit_trivia_entry(target_user_id uuid,target_answers jsonb,target_response_ms bigint,target_idempotency_key text)
returns table(round_id bigint,correct_count int,credits_balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
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

-- Fixed, disclosed payout tiers -- never adjusted per-round. Ranking is by correct answers desc,
-- then response time asc (faster wins ties). 70% of the pool is paid out; 30% is the platform rake.
create or replace function public.settle_trivia_round(target_round_id bigint)
returns table(entrant_count bigint,payout_credits bigint,house_take_credits bigint)
language plpgsql security definer set search_path = '' as $$
declare
  payout_bp constant int := 7000;
  current_round public.daily_trivia_rounds%rowtype;
  total_payout_pool bigint;
  house_take bigint;
  entry public.daily_trivia_entries%rowtype;
  rank_position int := 0;
  tier_shares_bp int[];
  share_bp int;
  entry_payout bigint;
  wallet_result record;
begin
  select * into current_round from public.daily_trivia_rounds where id = target_round_id and status = 'open' for update;
  if current_round.id is null then raise exception 'round_not_open' using errcode='22023'; end if;
  if current_round.closes_at > now() then raise exception 'round_not_closed_yet' using errcode='22023'; end if;

  total_payout_pool := floor(current_round.pool_credits::numeric * payout_bp / 10000)::bigint;
  house_take := current_round.pool_credits - total_payout_pool;

  if current_round.entrant_count = 0 then
    tier_shares_bp := array[]::int[];
  elsif current_round.entrant_count = 1 then
    tier_shares_bp := array[10000];
  elsif current_round.entrant_count = 2 then
    tier_shares_bp := array[6000,4000];
  else
    tier_shares_bp := array[5000,3000,2000];
  end if;

  for entry in select * from public.daily_trivia_entries where round_id = target_round_id order by correct_count desc, response_ms asc, id asc loop
    rank_position := rank_position + 1;
    if rank_position <= array_length(tier_shares_bp,1) then
      share_bp := tier_shares_bp[rank_position];
      entry_payout := floor(total_payout_pool::numeric * share_bp / 10000)::bigint;
      if entry_payout > 0 then
        select * into wallet_result from public.apply_wallet_entry(entry.user_id,entry_payout,'trivia_payout','Daily Trivia payout','trivia-payout:'||target_round_id||':'||entry.user_id,jsonb_build_object('round_id',target_round_id,'rank',rank_position));
        insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('trivia',entry.user_id,current_round.entry_credits,entry_payout,jsonb_build_object('round_id',target_round_id,'rank',rank_position,'correct_count',entry.correct_count));
      end if;
    else
      entry_payout := 0;
    end if;
    update public.daily_trivia_entries set rank = rank_position, payout_credits = entry_payout where id = entry.id;
  end loop;

  if house_take > 0 then
    perform public.credit_platform_revenue('trivia',house_take,'Daily Trivia round margin','trivia-revenue:'||target_round_id,jsonb_build_object('round_id',target_round_id));
  end if;

  update public.daily_trivia_rounds set status='settled',payout_credits=total_payout_pool,house_take_credits=house_take,settled_at=now() where id = target_round_id;

  entrant_count := current_round.entrant_count; payout_credits := total_payout_pool; house_take_credits := house_take;
  return next;
end;
$$;
revoke all on function public.settle_trivia_round(bigint) from public,anon,authenticated;
grant execute on function public.settle_trivia_round(bigint) to service_role;
