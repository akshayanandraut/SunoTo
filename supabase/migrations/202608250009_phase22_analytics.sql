create table if not exists public.analytics_event_keys (
  event_id text primary key,
  event_name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.analytics_daily (
  event_day date not null,
  event_name text not null,
  dimension text not null default 'total',
  event_count bigint not null default 0 check(event_count>=0),
  value_total bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(event_day,event_name,dimension)
);
alter table public.analytics_event_keys enable row level security;
alter table public.analytics_daily enable row level security;
revoke all on public.analytics_event_keys,public.analytics_daily from anon,authenticated;

create or replace function public.record_analytics_event(target_event_id text,target_event_name text,target_dimension text default 'total',target_value bigint default 0,target_time timestamptz default now())
returns boolean language plpgsql security definer set search_path='' as $$
declare allowed text[]:=array['landing_view','onboarding_completed','search_started','match_found','virtual_match_found','message_sent','free_connection_consumed','free_trial_exhausted','signup_started','signup_verified','recharge_started','recharge_success','recharge_failed','daily_access_activated','preference_search_started','preference_match_success','preference_fallback','paid_message_sent','contact_unlock_success','reconnect_requested','reconnect_accepted','like_sent','report_sent','block_created','next_clicked','skip_cooldown_triggered','idle_removed','return_visit'];
begin
  if length(target_event_id)<8 or length(target_event_id)>160 or not(target_event_name=any(allowed)) or target_dimension not in ('total','real','virtual','free','paid','anonymous','registered') or abs(target_value)>1000000000000 then raise exception 'invalid_analytics_event';end if;
  insert into public.analytics_event_keys(event_id,event_name,created_at) values(target_event_id,target_event_name,target_time) on conflict do nothing;if not found then return false;end if;
  insert into public.analytics_daily(event_day,event_name,dimension,event_count,value_total) values((target_time at time zone 'Asia/Kolkata')::date,target_event_name,target_dimension,1,target_value) on conflict(event_day,event_name,dimension) do update set event_count=analytics_daily.event_count+1,value_total=analytics_daily.value_total+target_value,updated_at=now();return true;
end;$$;

create or replace function public.public_analytics_snapshot()
returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object(
  'realConnectionsToday',coalesce(sum(event_count) filter(where event_name='match_found' and dimension='real'),0),
  'virtualConnectionsToday',coalesce(sum(event_count) filter(where event_name='virtual_match_found' and dimension='virtual'),0),
  'messagesToday',coalesce(sum(event_count) filter(where event_name='message_sent'),0),
  'asOf',now()
) from public.analytics_daily where event_day=(now() at time zone 'Asia/Kolkata')::date;$$;

create or replace function public.admin_analytics_snapshot(result_days integer default 30)
returns table(event_day date,event_name text,dimension text,event_count bigint,value_total bigint)
language sql security definer set search_path='' as $$select a.event_day,a.event_name,a.dimension,a.event_count,a.value_total from public.analytics_daily a where a.event_day>=((now() at time zone 'Asia/Kolkata')::date-least(greatest(result_days,1),365)+1) order by a.event_day desc,a.event_name,a.dimension;$$;

revoke all on function public.record_analytics_event(text,text,text,bigint,timestamptz),function public.public_analytics_snapshot(),function public.admin_analytics_snapshot(integer) from public,anon,authenticated;
grant execute on function public.record_analytics_event(text,text,text,bigint,timestamptz),function public.public_analytics_snapshot(),function public.admin_analytics_snapshot(integer) to service_role;
