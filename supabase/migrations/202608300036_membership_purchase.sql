-- Self-serve membership purchase: two paths, both ultimately calling admin_grant_premium_days'
-- underlying day-extension logic (factored out into grant_premium_days_internal so both the
-- admin-manual and self-serve paths share one implementation).
--   1. Real money via Razorpay, mirroring the existing Sparks-recharge order/verify/webhook flow
--      (payment_orders/record_payment_credit) but against a parallel membership_orders table.
--   2. Sparks redemption -- spend already-owned Sparks/Credits for premium days at a disclosed rate,
--      no payment gateway involved.
-- "Tokens" and "Sparks" are the same currency (per explicit user clarification) -- there is no
-- separate token ledger; this migration only adds membership-specific plumbing on top of the
-- existing wallet.

insert into public.app_config(key,value) values (
  'membership',
  '{"plans":[{"id":"30d","label":"30 Days","days":30,"amountPaise":29900},{"id":"90d","label":"90 Days","days":90,"amountPaise":74900},{"id":"365d","label":"365 Days","days":365,"amountPaise":239900}],"sparksPerDay":100}'::jsonb
) on conflict (key) do nothing;

create or replace function public.update_membership_config(admin_id uuid,expected_version bigint,new_value jsonb)
returns table(value jsonb,version bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare current_row public.app_config%rowtype;
begin
  select * into current_row from public.app_config where key='membership' for update;
  if not found then raise exception 'membership_config_missing'; end if;
  if current_row.version<>expected_version then raise exception 'config_version_conflict'; end if;
  update public.app_config set value=new_value,version=current_row.version+1,updated_at=now(),updated_by=admin_id where key='membership'
  returning app_config.value,app_config.version,app_config.updated_at into value,version,updated_at;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value)
  values(admin_id,'config.update','app_config','membership',current_row.value,new_value);
  return next;
end;$$;
revoke all on function public.update_membership_config(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.update_membership_config(uuid,bigint,jsonb) to service_role;

create or replace function public.grant_premium_days_internal(target_user_id uuid,days int)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if days is null or days <= 0 or days > 3650 then raise exception 'invalid_days' using errcode='22023'; end if;
  update public.profiles set is_premium=true,premium_expires_at=greatest(now(),coalesce(premium_expires_at,now())) + make_interval(days=>days),updated_at=now() where user_id=target_user_id;
  if not found then raise exception 'profile_missing'; end if;
end;
$$;
revoke all on function public.grant_premium_days_internal(uuid,int) from public,anon,authenticated;
grant execute on function public.grant_premium_days_internal(uuid,int) to service_role;

create or replace function public.admin_grant_premium_days(admin_id uuid,target_user_id uuid,days int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare before_row jsonb;after_row jsonb;
begin
  select to_jsonb(p) into before_row from public.profiles p where user_id=target_user_id for update;
  if before_row is null then raise exception 'profile_missing'; end if;
  perform public.grant_premium_days_internal(target_user_id,days);
  select to_jsonb(p) into after_row from public.profiles p where user_id=target_user_id;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'premium.grant_days','user',target_user_id::text,before_row,after_row);
  return after_row;
end;
$$;
revoke all on function public.admin_grant_premium_days(uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.admin_grant_premium_days(uuid,uuid,int) to service_role;

create table if not exists public.membership_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id text not null unique,
  receipt text not null unique,
  plan_id text not null,
  days int not null check (days > 0),
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created',
  provider_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists membership_orders_provider_payment_idx on public.membership_orders(provider_payment_id) where provider_payment_id is not null;
alter table public.membership_orders enable row level security;
revoke all on public.membership_orders from anon, authenticated;
grant select on public.membership_orders to authenticated;
create policy "users read own membership orders" on public.membership_orders for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.prepare_membership_order(target_user_id uuid,target_provider_order_id text,target_receipt text,target_plan_id text,target_days int,target_amount_paise bigint)
returns table(id uuid,days int,plan_id text)
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.membership_orders(user_id,provider_order_id,receipt,plan_id,days,amount_paise)
    values(target_user_id,target_provider_order_id,target_receipt,target_plan_id,target_days,target_amount_paise)
    returning membership_orders.id,membership_orders.days,membership_orders.plan_id into id,days,plan_id;
end;
$$;
revoke all on function public.prepare_membership_order(uuid,text,text,text,int,bigint) from public,anon,authenticated;
grant execute on function public.prepare_membership_order(uuid,text,text,text,int,bigint) to service_role;

create or replace function public.record_membership_credit(target_provider_event_id text,target_event_type text,target_provider_order_id text,target_provider_payment_id text,target_status text default 'paid')
returns table(days int,idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare target_order public.membership_orders%rowtype;
begin
  select * into target_order from public.membership_orders where provider_order_id=target_provider_order_id for update;
  if target_order.id is null then raise exception 'membership_order_not_found' using errcode='P0002';end if;
  if target_status not in ('paid','captured') then raise exception 'payment_not_captured' using errcode='22023';end if;
  insert into public.payment_events(provider_event_id,event_type,provider_order_id,provider_payment_id,outcome)
    values(target_provider_event_id,target_event_type,target_provider_order_id,target_provider_payment_id,'credited')
    on conflict(provider_event_id) do nothing;
  if not found then days:=target_order.days;idempotent:=true;return next;return;end if;
  perform public.grant_premium_days_internal(target_order.user_id,target_order.days);
  update public.membership_orders set status='paid',provider_payment_id=target_provider_payment_id,updated_at=now() where id=target_order.id;
  days:=target_order.days;idempotent:=false;return next;
end;
$$;
revoke all on function public.record_membership_credit(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_membership_credit(text,text,text,text,text) to service_role;

create or replace function public.redeem_sparks_for_premium_days(target_days int,target_idempotency_key text)
returns table(balance bigint,premium_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();sparks_per_day int;stake_result record;
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not exists(select 1 from auth.users where id = uid and email_confirmed_at is not null) then raise exception 'email_verification_required' using errcode = '42501'; end if;
  if target_days is null or target_days <= 0 or target_days > 3650 then raise exception 'invalid_days' using errcode='22023'; end if;
  select coalesce((value->>'sparksPerDay')::int,100) into sparks_per_day from public.app_config where key='membership';
  select * into stake_result from public.apply_wallet_entry(uid,-(sparks_per_day*100*target_days)::bigint,'premium_redemption','Sparks redeemed for membership days',target_idempotency_key,jsonb_build_object('days',target_days));
  perform public.grant_premium_days_internal(uid,target_days);
  select p.premium_expires_at into premium_expires_at from public.profiles p where p.user_id=uid;
  balance:=stake_result.balance;return next;
end;
$$;
revoke all on function public.redeem_sparks_for_premium_days(int,text) from public,anon;
grant execute on function public.redeem_sparks_for_premium_days(int,text) to authenticated;
