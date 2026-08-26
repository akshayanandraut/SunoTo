insert into public.app_config(key,value)
values ('video','{"enabled":false,"betaUserIds":[]}'::jsonb)
on conflict (key) do nothing;

create or replace function public.update_video_config(admin_id uuid,expected_version bigint,new_value jsonb)
returns table(value jsonb,version bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare current_row public.app_config%rowtype;
begin
  select * into current_row from public.app_config where key='video' for update;
  if not found then raise exception 'video_config_missing'; end if;
  if current_row.version<>expected_version then raise exception 'config_version_conflict'; end if;
  update public.app_config set value=new_value,version=current_row.version+1,updated_at=now(),updated_by=admin_id where key='video'
  returning app_config.value,app_config.version,app_config.updated_at into value,version,updated_at;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value)
  values(admin_id,'config.update','app_config','video',current_row.value,new_value);
  return next;
end;$$;

revoke all on function public.update_video_config(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.update_video_config(uuid,bigint,jsonb) to service_role;
