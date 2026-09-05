-- Betting (Sparks-staked games, sportsbook, arcade/casino payout games) is a distinct section from the
-- rest of the platform: users must explicitly opt in once before any staking route will accept them,
-- separate from and in addition to the existing game_staking_enabled kill-switch. This is a per-user
-- consent record, not a platform-wide toggle.
alter table public.profiles add column if not exists betting_opted_in_at timestamptz;

create or replace function public.opt_in_to_betting()
returns table(betting_opted_in_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not exists(select 1 from auth.users where id = uid and email_confirmed_at is not null) then raise exception 'email_verification_required' using errcode = '42501'; end if;
  update public.profiles set betting_opted_in_at = coalesce(betting_opted_in_at, now()) where user_id = uid
  returning profiles.betting_opted_in_at into betting_opted_in_at;
  return next;
end;
$$;
revoke all on function public.opt_in_to_betting() from public,anon;
grant execute on function public.opt_in_to_betting() to authenticated;
