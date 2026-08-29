alter table public.profiles add column if not exists video_sessions_used smallint not null default 0;

create or replace function public.increment_video_session(target_user_id uuid)
returns smallint
language sql security definer set search_path = '' as $$
  update public.profiles set video_sessions_used=video_sessions_used+1,updated_at=now() where user_id=target_user_id
  returning video_sessions_used;
$$;
revoke all on function public.increment_video_session(uuid) from public,anon,authenticated;
grant execute on function public.increment_video_session(uuid) to service_role;
