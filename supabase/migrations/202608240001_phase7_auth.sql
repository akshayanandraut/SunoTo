create extension if not exists citext with schema extensions;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_id uuid not null default gen_random_uuid() unique,
  username extensions.citext unique,
  username_change_count smallint not null default 0 check (username_change_count between 0 and 3),
  username_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username is null or username::text ~ '^[A-Za-z0-9_]{3,24}$')
);

create table if not exists public.username_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  username extensions.citext not null,
  changed_at timestamptz not null default now()
);
create index if not exists username_history_user_changed_idx on public.username_history(user_id, changed_at desc);

alter table public.profiles enable row level security;
alter table public.username_history enable row level security;
revoke all on public.profiles from anon, authenticated;
revoke all on public.username_history from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.username_history to authenticated;

create policy "users read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read own username history" on public.username_history for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

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
