alter table public.profiles add column if not exists is_premium boolean not null default false;

create or replace function public.claim_username(desired_username text)
returns table(username text, username_change_count smallint, username_changed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean text := trim(desired_username);
  current_profile public.profiles%rowtype;
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not exists(select 1 from auth.users where id = uid and email_confirmed_at is not null) then raise exception 'email_verification_required' using errcode = '42501'; end if;
  if clean !~ '^[A-Za-z0-9_]{3,24}$' then raise exception 'invalid_username' using errcode = '22023'; end if;
  select * into current_profile from public.profiles where user_id = uid for update;
  if current_profile.user_id is null then raise exception 'profile_missing'; end if;
  if current_profile.username is not null and lower(current_profile.username::text) = lower(clean) then return query select current_profile.username::text,current_profile.username_change_count,current_profile.username_changed_at;return;end if;
  if not current_profile.is_premium then raise exception 'premium_required' using errcode = '42501'; end if;
  if current_profile.username is not null then
    if current_profile.username_change_count >= 3 then raise exception 'username_change_limit_reached' using errcode = '22023'; end if;
    if current_profile.username_changed_at > now() - interval '30 days' then raise exception 'username_change_cooldown' using errcode = '22023'; end if;
    insert into public.username_history(user_id,username) values(uid,current_profile.username);
  end if;
  update public.profiles p set username=clean,username_change_count=p.username_change_count + case when current_profile.username is null then 0 else 1 end,username_changed_at=now(),updated_at=now() where p.user_id=uid
  returning p.username::text,p.username_change_count,p.username_changed_at into username,username_change_count,username_changed_at;
  return next;
exception when unique_violation then raise exception 'username_unavailable' using errcode = '23505';
end;
$$;
revoke all on function public.claim_username(text) from public,anon;
grant execute on function public.claim_username(text) to authenticated;

create or replace function public.admin_set_premium(admin_id uuid,target_user_id uuid,premium boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare before_row jsonb;after_row jsonb;
begin
  select to_jsonb(p) into before_row from public.profiles p where user_id=target_user_id for update;
  if before_row is null then raise exception 'profile_missing'; end if;
  update public.profiles set is_premium=premium,updated_at=now() where user_id=target_user_id;
  select to_jsonb(p) into after_row from public.profiles p where user_id=target_user_id;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'premium.'||(case when premium then 'grant' else 'revoke' end),'user',target_user_id::text,before_row,after_row);
  return after_row;
end;
$$;
revoke all on function public.admin_set_premium(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_premium(uuid,uuid,boolean) to service_role;
