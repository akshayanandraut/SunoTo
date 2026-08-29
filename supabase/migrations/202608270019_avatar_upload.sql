drop function if exists public.set_avatar_url(text);

create or replace function public.set_avatar_url(desired_avatar_url text)
returns table(avatar_url text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_profile public.profiles%rowtype;
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into current_profile from public.profiles where user_id = uid for update;
  if current_profile.user_id is null then raise exception 'profile_missing'; end if;
  if current_profile.verified_at is null then raise exception 'verification_required' using errcode = '42501'; end if;
  if desired_avatar_url is not null and length(desired_avatar_url) > 500 then raise exception 'invalid_avatar_url' using errcode = '22023'; end if;
  update public.profiles p set avatar_url=desired_avatar_url,updated_at=now() where p.user_id=uid
  returning p.avatar_url into avatar_url;
  return next;
end;
$$;
revoke all on function public.set_avatar_url(text) from public,anon;
grant execute on function public.set_avatar_url(text) to authenticated;
