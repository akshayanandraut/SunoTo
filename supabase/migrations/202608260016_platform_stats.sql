create or replace function public.public_analytics_snapshot()
returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object(
  'realConnectionsToday',coalesce(sum(event_count) filter(where event_name='match_found' and dimension='real'),0),
  'virtualConnectionsToday',coalesce(sum(event_count) filter(where event_name='virtual_match_found' and dimension='virtual'),0),
  'messagesToday',coalesce(sum(event_count) filter(where event_name='message_sent'),0),
  'registeredUsers',(select count(*) from public.profiles),
  'asOf',now()
) from public.analytics_daily where event_day=(now() at time zone 'Asia/Kolkata')::date;$$;

revoke all on function public.public_analytics_snapshot() from public,anon,authenticated;
grant execute on function public.public_analytics_snapshot() to service_role;
