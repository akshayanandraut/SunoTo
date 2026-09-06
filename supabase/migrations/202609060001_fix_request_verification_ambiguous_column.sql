-- Fix "column reference balance is ambiguous" on the idempotent-replay path of
-- request_verification: `select balance into balance from public.wallets` collided the table
-- column with the function's own `balance` OUT parameter (same bug class as
-- 202609010002_fix_ad_earning_ambiguous_column.sql). Qualify with a table alias.
create or replace function public.request_verification(target_user_id uuid)
returns table(verified_at timestamptz,balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare active_days integer;wallet_result record;already timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text,1));
  select p.verified_at into already from public.profiles p where p.user_id=target_user_id;
  if already is not null then verified_at:=already;select w.balance into balance from public.wallets w where w.user_id=target_user_id;idempotent:=true;return next;return;end if;
  select count(distinct access_day) into active_days from public.daily_entitlements where user_id=target_user_id and access_day>=(current_date-30);
  if coalesce(active_days,0)<15 then raise exception 'verification_requires_consistent_activity' using errcode='22023';end if;
  select * into wallet_result from public.apply_wallet_entry(target_user_id,-100,'verification','Profile verification',('verification:'||target_user_id::text),jsonb_build_object('active_days',active_days));
  update public.profiles set verified_at=now() where user_id=target_user_id returning profiles.verified_at into verified_at;
  balance:=wallet_result.balance;idempotent:=false;return next;
end;
$$;
revoke all on function public.request_verification(uuid) from public,anon,authenticated;
grant execute on function public.request_verification(uuid) to service_role;
