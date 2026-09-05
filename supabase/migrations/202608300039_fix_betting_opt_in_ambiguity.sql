-- opt_in_to_betting's SET clause referenced the bare column name `betting_opted_in_at`, which is
-- ambiguous against the function's own OUT parameter of the same name -- Postgres can't tell which
-- one `coalesce(betting_opted_in_at, now())` means. Qualify the column with the table name.
create or replace function public.opt_in_to_betting()
returns table(betting_opted_in_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not exists(select 1 from auth.users where id = uid and email_confirmed_at is not null) then raise exception 'email_verification_required' using errcode = '42501'; end if;
  update public.profiles set betting_opted_in_at = coalesce(profiles.betting_opted_in_at, now()) where user_id = uid
  returning profiles.betting_opted_in_at into betting_opted_in_at;
  return next;
end;
$$;
