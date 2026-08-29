alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists verified_at timestamptz;

create table if not exists public.streaming_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  razorpay_subscription_id text unique,
  status text not null default 'created' check (status in ('created','active','cancelled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.streaming_memberships enable row level security;
revoke all on public.streaming_memberships from anon,authenticated;
grant select on public.streaming_memberships to authenticated;
create policy "users read own streaming membership" on public.streaming_memberships for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.upsert_streaming_membership(target_user_id uuid,subscription_id text,new_status text,period_end timestamptz)
returns table(status text,current_period_end timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if new_status not in ('created','active','cancelled') then raise exception 'invalid_membership_status'; end if;
  insert into public.streaming_memberships(user_id,razorpay_subscription_id,status,current_period_end)
  values(target_user_id,subscription_id,new_status,period_end)
  on conflict(user_id) do update set razorpay_subscription_id=excluded.razorpay_subscription_id,status=excluded.status,current_period_end=coalesce(excluded.current_period_end,public.streaming_memberships.current_period_end),updated_at=now();
  select m.status,m.current_period_end into status,current_period_end from public.streaming_memberships m where m.user_id=target_user_id;
  return next;
end;
$$;
revoke all on function public.upsert_streaming_membership(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.upsert_streaming_membership(uuid,text,text,timestamptz) to service_role;

create or replace function public.streaming_membership_status(target_user_id uuid)
returns boolean language sql security definer set search_path='' as $$
select exists(select 1 from public.streaming_memberships where user_id=target_user_id and status='active' and (current_period_end is null or current_period_end>now()));
$$;
revoke all on function public.streaming_membership_status(uuid) from public,anon,authenticated;
grant execute on function public.streaming_membership_status(uuid) to service_role;

create or replace function public.subscription_id_to_user(subscription_id text)
returns uuid language sql security definer set search_path='' as $$
select user_id from public.streaming_memberships where razorpay_subscription_id=subscription_id limit 1;
$$;
revoke all on function public.subscription_id_to_user(text) from public,anon,authenticated;
grant execute on function public.subscription_id_to_user(text) to service_role;

create or replace function public.request_verification(target_user_id uuid)
returns table(verified_at timestamptz,balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare active_days integer;wallet_result record;already timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text,1));
  select p.verified_at into already from public.profiles p where p.user_id=target_user_id;
  if already is not null then verified_at:=already;select balance into balance from public.wallets where user_id=target_user_id;idempotent:=true;return next;return;end if;
  select count(distinct access_day) into active_days from public.daily_entitlements where user_id=target_user_id and access_day>=(current_date-30);
  if coalesce(active_days,0)<15 then raise exception 'verification_requires_consistent_activity' using errcode='22023';end if;
  select * into wallet_result from public.apply_wallet_entry(target_user_id,-100,'verification','Profile verification',('verification:'||target_user_id::text),jsonb_build_object('active_days',active_days));
  update public.profiles set verified_at=now() where user_id=target_user_id returning profiles.verified_at into verified_at;
  balance:=wallet_result.balance;idempotent:=false;return next;
end;
$$;
revoke all on function public.request_verification(uuid) from public,anon,authenticated;
grant execute on function public.request_verification(uuid) to service_role;
