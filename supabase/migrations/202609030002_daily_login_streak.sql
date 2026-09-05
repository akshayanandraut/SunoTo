-- Daily login streak bonus: a simple "come back every day" retention lever. Each calendar day
-- (UTC) a signed-in user claims once, the reward grows with consecutive days claimed (capped at
-- maxStreakDays), and missing a day resets the streak back to 1. Reuses apply_wallet_entry for the
-- actual Credits payout, same as claim_ad_reward. Enabled by default -- unlike ad_earning this has
-- no external dependency (no ad inventory needed), so it can go live immediately.

insert into public.app_config(key,value) values (
  'daily_streak',
  '{"enabled":true,"baseCreditsPerDay":500,"maxStreakDays":7}'::jsonb
) on conflict (key) do nothing;

create table if not exists public.daily_streak_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_date date not null,
  streak_count int not null check (streak_count > 0),
  credits_awarded int not null check (credits_awarded > 0),
  created_at timestamptz not null default now(),
  unique(user_id,claim_date)
);
create index if not exists daily_streak_claims_user_date_idx on public.daily_streak_claims(user_id,claim_date desc);
alter table public.daily_streak_claims enable row level security;
revoke all on public.daily_streak_claims from public,anon,authenticated;

create or replace function public.claim_daily_streak_bonus(target_user_id uuid)
returns table(balance bigint,streak_count int,credits_awarded int,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare
  cfg jsonb;
  today date := (now() at time zone 'utc')::date;
  yesterday date := today - 1;
  existing public.daily_streak_claims%rowtype;
  prev public.daily_streak_claims%rowtype;
  wallet_result record;
  new_id uuid;
  new_streak_actual int;
  reward_tier int;
  base_credits int;
  max_streak_days int;
  credits int;
begin
  select * into existing from public.daily_streak_claims where user_id=target_user_id and claim_date=today;
  if existing.id is not null then
    select * into wallet_result from public.apply_wallet_entry(target_user_id,existing.credits_awarded::bigint,'daily_streak_claim','Daily login streak bonus','streak:'||existing.id,'{}'::jsonb);
    balance:=wallet_result.balance;streak_count:=existing.streak_count;credits_awarded:=existing.credits_awarded;idempotent:=true;
    return next;
    return;
  end if;

  select value into cfg from public.app_config where key='daily_streak';
  if cfg is null or coalesce((cfg->>'enabled')::boolean,false)=false then raise exception 'daily_streak_disabled' using errcode='42501'; end if;

  base_credits:=coalesce((cfg->>'baseCreditsPerDay')::int,500);
  max_streak_days:=coalesce((cfg->>'maxStreakDays')::int,7);

  select * into prev from public.daily_streak_claims where user_id=target_user_id and claim_date=yesterday;
  new_streak_actual:=case when prev.id is not null then prev.streak_count+1 else 1 end;
  reward_tier:=least(new_streak_actual,max_streak_days);
  credits:=base_credits*reward_tier;

  insert into public.daily_streak_claims(user_id,claim_date,streak_count,credits_awarded) values(target_user_id,today,new_streak_actual,credits) returning id into new_id;
  select * into wallet_result from public.apply_wallet_entry(target_user_id,credits::bigint,'daily_streak_claim','Daily login streak bonus','streak:'||new_id,'{}'::jsonb);
  balance:=wallet_result.balance;streak_count:=new_streak_actual;credits_awarded:=credits;idempotent:=false;
  return next;
end;
$$;
revoke all on function public.claim_daily_streak_bonus(uuid) from public,anon,authenticated;
grant execute on function public.claim_daily_streak_bonus(uuid) to service_role;

create or replace function public.daily_streak_status(target_user_id uuid)
returns table(enabled boolean,streak_count int,claimed_today boolean,next_reward_credits int)
language plpgsql security definer set search_path='' as $$
declare
  cfg jsonb;
  today date := (now() at time zone 'utc')::date;
  yesterday date := today - 1;
  today_row public.daily_streak_claims%rowtype;
  prev public.daily_streak_claims%rowtype;
  base_credits int;
  max_streak_days int;
  projected int;
begin
  select value into cfg from public.app_config where key='daily_streak';
  enabled:=coalesce((cfg->>'enabled')::boolean,false);
  base_credits:=coalesce((cfg->>'baseCreditsPerDay')::int,500);
  max_streak_days:=coalesce((cfg->>'maxStreakDays')::int,7);

  select * into today_row from public.daily_streak_claims where user_id=target_user_id and claim_date=today;
  if today_row.id is not null then
    streak_count:=today_row.streak_count;claimed_today:=true;next_reward_credits:=today_row.credits_awarded;
  else
    select * into prev from public.daily_streak_claims where user_id=target_user_id and claim_date=yesterday;
    streak_count:=coalesce(prev.streak_count,0);
    claimed_today:=false;
    projected:=least(streak_count+1,max_streak_days);
    next_reward_credits:=base_credits*projected;
  end if;
  return next;
end;
$$;
revoke all on function public.daily_streak_status(uuid) from public,anon,authenticated;
grant execute on function public.daily_streak_status(uuid) to service_role;

create or replace function public.update_daily_streak_config(admin_id uuid,expected_version bigint,new_value jsonb)
returns table(value jsonb,version bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare current_row public.app_config%rowtype;
begin
  select * into current_row from public.app_config where key='daily_streak' for update;
  if not found then raise exception 'daily_streak_config_missing'; end if;
  if current_row.version<>expected_version then raise exception 'config_version_conflict'; end if;
  update public.app_config set value=new_value,version=current_row.version+1,updated_at=now(),updated_by=admin_id where key='daily_streak'
  returning app_config.value,app_config.version,app_config.updated_at into value,version,updated_at;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value)
  values(admin_id,'config.update','app_config','daily_streak',current_row.value,new_value);
  return next;
end;$$;

revoke all on function public.update_daily_streak_config(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.update_daily_streak_config(uuid,bigint,jsonb) to service_role;
