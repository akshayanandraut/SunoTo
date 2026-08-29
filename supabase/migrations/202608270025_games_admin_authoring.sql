-- Admin authoring for game content: wheel odds and upcoming Daily Trivia question sets.
-- Read paths stay exactly as before (wheel_segments/daily_trivia_rounds); these are the only new
-- write paths, gated by the same super-admin check already enforced at the worker layer
-- (adminUser()) before any of these RPCs are ever called, same as every other admin_* RPC.

create or replace function public.admin_update_wheel_segments(admin_id uuid,segments jsonb)
returns setof public.wheel_segments
language plpgsql security definer set search_path = '' as $$
declare
  before_rows jsonb;
  after_rows jsonb;
  total_weight int;
  segment jsonb;
begin
  select coalesce(sum((segment->>'weight_bp')::int),0) into total_weight from jsonb_array_elements(segments) segment;
  if total_weight <> 10000 then raise exception 'weight_bp_must_sum_to_10000' using errcode='22023'; end if;
  for segment in select * from jsonb_array_elements(segments) loop
    if (segment->>'multiplier_bp')::int < 0 or (segment->>'multiplier_bp')::int > 15000 then raise exception 'invalid_multiplier_bp' using errcode='22023'; end if;
    if (segment->>'weight_bp')::int <= 0 then raise exception 'invalid_weight_bp' using errcode='22023'; end if;
  end loop;

  select jsonb_agg(to_jsonb(w)) into before_rows from public.wheel_segments w;

  for segment in select * from jsonb_array_elements(segments) loop
    insert into public.wheel_segments(id,label,weight_bp,multiplier_bp)
      values((segment->>'id')::smallint,segment->>'label',(segment->>'weight_bp')::int,(segment->>'multiplier_bp')::int)
      on conflict (id) do update set label=excluded.label,weight_bp=excluded.weight_bp,multiplier_bp=excluded.multiplier_bp;
  end loop;
  delete from public.wheel_segments where id not in (select (segment->>'id')::smallint from jsonb_array_elements(segments) segment);

  select jsonb_agg(to_jsonb(w)) into after_rows from public.wheel_segments w;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'games.wheel_segments.update','wheel_segments','all',before_rows,after_rows);

  return query select * from public.wheel_segments order by id;
end;
$$;
revoke all on function public.admin_update_wheel_segments(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_update_wheel_segments(uuid,jsonb) to service_role;

-- Lets an admin pre-author a future day's 5 Trivia questions. get_or_create_open_trivia_round checks
-- this table first and falls back to the hardcoded default set only if nothing was scheduled.
create table if not exists public.daily_trivia_scheduled_questions (
  trivia_date date primary key,
  questions jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.daily_trivia_scheduled_questions enable row level security;
revoke all on public.daily_trivia_scheduled_questions from anon, authenticated;

create or replace function public.admin_schedule_trivia_questions(admin_id uuid,target_date date,questions jsonb)
returns public.daily_trivia_scheduled_questions
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb;
  after_row public.daily_trivia_scheduled_questions%rowtype;
  question jsonb;
begin
  if jsonb_array_length(questions) <> 5 then raise exception 'exactly_5_questions_required' using errcode='22023'; end if;
  if exists(select 1 from public.daily_trivia_rounds where trivia_date=target_date) then raise exception 'round_already_created_for_date' using errcode='22023'; end if;
  for question in select * from jsonb_array_elements(questions) loop
    if question->>'question' is null or jsonb_typeof(question->'options') <> 'array' or jsonb_array_length(question->'options') < 2 or question->'correct_index' is null then
      raise exception 'invalid_question_shape' using errcode='22023';
    end if;
    if (question->>'correct_index')::int < 0 or (question->>'correct_index')::int >= jsonb_array_length(question->'options') then
      raise exception 'correct_index_out_of_range' using errcode='22023';
    end if;
  end loop;

  select to_jsonb(s) into before_row from public.daily_trivia_scheduled_questions s where trivia_date=target_date;
  insert into public.daily_trivia_scheduled_questions(trivia_date,questions) values(target_date,questions)
    on conflict (trivia_date) do update set questions=excluded.questions
    returning * into after_row;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'games.trivia_questions.schedule','daily_trivia_scheduled_questions',target_date::text,before_row,to_jsonb(after_row));

  return after_row;
end;
$$;
revoke all on function public.admin_schedule_trivia_questions(uuid,date,jsonb) from public,anon,authenticated;
grant execute on function public.admin_schedule_trivia_questions(uuid,date,jsonb) to service_role;

create or replace function public.get_or_create_open_trivia_round()
returns public.daily_trivia_rounds
language plpgsql security definer set search_path = '' as $$
declare
  current_round public.daily_trivia_rounds%rowtype;
  today date := (now() at time zone 'utc')::date;
  scheduled public.daily_trivia_scheduled_questions%rowtype;
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
  select * into scheduled from public.daily_trivia_scheduled_questions where trivia_date = today;
  insert into public.daily_trivia_rounds(trivia_date, questions, opens_at, closes_at)
    values(today, coalesce(scheduled.questions, default_questions), now(), (today + 1)::timestamptz)
    on conflict (trivia_date) do update set trivia_date = excluded.trivia_date
    returning * into current_round;
  return current_round;
end;
$$;
revoke all on function public.get_or_create_open_trivia_round() from public,anon,authenticated;
grant execute on function public.get_or_create_open_trivia_round() to service_role;
