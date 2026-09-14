-- T-103 (Decision G): the documented trigger for building a real SFU is ">20% of party-room video
-- sessions hitting the 4-publisher cap" -- that trigger needs to be measurable, not guessed. Adds the
-- two new event names to record_analytics_event's allowlist so PartyRoomShard can record them.
create or replace function public.record_analytics_event(target_event_id text,target_event_name text,target_dimension text default 'total',target_value bigint default 0,target_time timestamptz default now())
returns boolean language plpgsql security definer set search_path='' as $$
declare allowed text[]:=array['landing_view','onboarding_completed','search_started','match_found','virtual_match_found','message_sent','free_connection_consumed','free_trial_exhausted','signup_started','signup_verified','recharge_started','recharge_success','recharge_failed','daily_access_activated','preference_search_started','preference_match_success','preference_fallback','paid_message_sent','contact_unlock_success','reconnect_requested','reconnect_accepted','like_sent','report_sent','block_created','next_clicked','skip_cooldown_triggered','idle_removed','return_visit','party_video_publisher_started','party_video_publisher_cap_hit'];
begin
  if length(target_event_id)<8 or length(target_event_id)>160 or not(target_event_name=any(allowed)) or target_dimension not in ('total','real','virtual','free','paid','anonymous','registered') or abs(target_value)>1000000000000 then raise exception 'invalid_analytics_event';end if;
  insert into public.analytics_event_keys(event_id,event_name,created_at) values(target_event_id,target_event_name,target_time) on conflict do nothing;if not found then return false;end if;
  insert into public.analytics_daily(event_day,event_name,dimension,event_count,value_total) values((target_time at time zone 'Asia/Kolkata')::date,target_event_name,target_dimension,1,target_value) on conflict(event_day,event_name,dimension) do update set event_count=analytics_daily.event_count+1,value_total=analytics_daily.value_total+target_value,updated_at=now();return true;
end;
$$;
revoke all on function public.record_analytics_event(text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.record_analytics_event(text,text,text,bigint,timestamptz) to service_role;
