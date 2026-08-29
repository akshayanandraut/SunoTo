alter table public.profiles drop column if exists theme_id;
alter table public.profiles add column if not exists theme_pattern text not null default 'solid';
alter table public.profiles add column if not exists theme_palette text not null default 'mint';

drop function if exists public.set_theme(text);

create or replace function public.set_theme(desired_pattern text,desired_palette text)
returns table(theme_pattern text,theme_palette text)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  current_profile public.profiles%rowtype;
  premium_pattern_ids text[] := array['hearts','stripes','lines','aurora','midnight'];
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if desired_pattern not in ('solid','hearts','stripes','lines','aurora','midnight') then raise exception 'invalid_theme' using errcode = '22023'; end if;
  if desired_palette not in ('mint','coral','sky','sunshine','berry','charcoal') then raise exception 'invalid_theme' using errcode = '22023'; end if;
  select * into current_profile from public.profiles where user_id = uid for update;
  if current_profile.user_id is null then raise exception 'profile_missing'; end if;
  if desired_pattern = any(premium_pattern_ids) and not current_profile.is_premium then raise exception 'premium_required' using errcode = '42501'; end if;
  update public.profiles p set theme_pattern=desired_pattern,theme_palette=desired_palette,updated_at=now() where p.user_id=uid
  returning p.theme_pattern,p.theme_palette into theme_pattern,theme_palette;
  return next;
end;
$$;
revoke all on function public.set_theme(text,text) from public,anon;
grant execute on function public.set_theme(text,text) to authenticated;
