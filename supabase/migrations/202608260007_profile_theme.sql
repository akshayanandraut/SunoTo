alter table public.profiles add column if not exists theme_id text not null default 'mint';

create or replace function public.set_theme(desired_theme_id text)
returns table(theme_id text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_profile public.profiles%rowtype;
  premium_theme_ids text[] := array['hearts','stripes','lines','aurora','midnight'];
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if desired_theme_id not in ('mint','coral','sky','sunshine','hearts','stripes','lines','aurora','midnight') then raise exception 'invalid_theme' using errcode = '22023'; end if;
  select * into current_profile from public.profiles where user_id = uid for update;
  if current_profile.user_id is null then raise exception 'profile_missing'; end if;
  if desired_theme_id = any(premium_theme_ids) and not current_profile.is_premium then raise exception 'premium_required' using errcode = '42501'; end if;
  update public.profiles p set theme_id=desired_theme_id,updated_at=now() where p.user_id=uid
  returning p.theme_id into theme_id;
  return next;
end;
$$;
revoke all on function public.set_theme(text) from public,anon;
grant execute on function public.set_theme(text) to authenticated;
