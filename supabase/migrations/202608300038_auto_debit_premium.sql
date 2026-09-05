-- Opt-in daily auto-debit for premium membership: instead of manually redeeming Sparks for a
-- block of days, a user can flip a flag that makes a daily cron sweep charge one day's worth of
-- Sparks (at the same disclosed rate as manual redemption, membership.sparksPerDay) and extend
-- premium_expires_at by 1 day. If the wallet balance is insufficient on a given day the charge is
-- simply skipped (no debt, no error surfaced) -- premium then lapses naturally via the existing
-- expire_premium_memberships() sweep, and auto-debit stays enabled in case the wallet is topped up
-- again later.

alter table public.profiles add column if not exists auto_debit_premium_enabled boolean not null default false;
alter table public.profiles add column if not exists auto_debit_premium_last_charged_date date;

create or replace function public.set_auto_debit_premium(enabled boolean)
returns table(auto_debit_premium_enabled boolean)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  update public.profiles set auto_debit_premium_enabled = enabled, updated_at = now() where user_id = uid
    returning profiles.auto_debit_premium_enabled into auto_debit_premium_enabled;
  if not found then raise exception 'profile_missing'; end if;
  return next;
end;
$$;
revoke all on function public.set_auto_debit_premium(boolean) from public,anon;
grant execute on function public.set_auto_debit_premium(boolean) to authenticated;

create or replace function public.run_auto_debit_premium_sweep()
returns table(charged_count int, skipped_count int)
language plpgsql security definer set search_path = '' as $$
declare target record;sparks_per_day int;credits_per_day bigint;charged int := 0;skipped int := 0;
begin
  select coalesce((value->>'sparksPerDay')::int,100) into sparks_per_day from public.app_config where key='membership';
  credits_per_day := sparks_per_day * 100;
  for target in
    select user_id from public.profiles
    where auto_debit_premium_enabled = true
      and (auto_debit_premium_last_charged_date is null or auto_debit_premium_last_charged_date < current_date)
    for update skip locked
  loop
    begin
      perform public.apply_wallet_entry(target.user_id,-credits_per_day,'premium_auto_debit','Automatic daily premium renewal',
        'premium-auto-debit:'||target.user_id::text||':'||current_date::text,jsonb_build_object('days',1));
      perform public.grant_premium_days_internal(target.user_id,1);
      update public.profiles set auto_debit_premium_last_charged_date = current_date where user_id = target.user_id;
      charged := charged + 1;
    exception when others then
      update public.profiles set auto_debit_premium_last_charged_date = current_date where user_id = target.user_id;
      skipped := skipped + 1;
    end;
  end loop;
  charged_count := charged;skipped_count := skipped;return next;
end;
$$;
revoke all on function public.run_auto_debit_premium_sweep() from public,anon,authenticated;
grant execute on function public.run_auto_debit_premium_sweep() to service_role;
