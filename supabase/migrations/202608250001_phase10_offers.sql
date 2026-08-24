create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(), name text not null,
  multiplier_bps integer not null default 10000 check (multiplier_bps >= 10000),
  fixed_bonus bigint not null default 0 check (fixed_bonus >= 0), min_recharge_paise bigint not null default 5000,
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  automatic boolean not null default true, combinable boolean not null default false, enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(), code text not null,
  multiplier_bps integer not null default 10000 check (multiplier_bps >= 10000), fixed_bonus bigint not null default 0 check (fixed_bonus >= 0),
  min_recharge_paise bigint not null default 5000, starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  max_redemptions integer, max_uses_per_account integer not null default 1 check (max_uses_per_account > 0),
  audience text not null default 'all' check (audience in ('all','new_users')), combinable boolean not null default false, enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists coupons_code_ci_idx on public.coupons(lower(code));
create table if not exists public.coupon_redemptions (
  id bigint generated always as identity primary key, coupon_id uuid not null references public.coupons(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict, payment_order_id uuid not null unique references public.payment_orders(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions(coupon_id);
create index if not exists coupon_redemptions_user_idx on public.coupon_redemptions(coupon_id,user_id);
alter table public.payment_orders add column if not exists offer_id uuid references public.offers(id) on delete restrict;
alter table public.payment_orders add column if not exists coupon_id uuid references public.coupons(id) on delete restrict;

alter table public.offers enable row level security;alter table public.coupons enable row level security;alter table public.coupon_redemptions enable row level security;
revoke all on public.offers,public.coupons,public.coupon_redemptions from anon,authenticated;
grant select on public.offers,public.coupons to authenticated;
create policy "authenticated read active offers" on public.offers for select to authenticated using (enabled and now() between starts_at and ends_at);
create policy "authenticated read active coupons" on public.coupons for select to authenticated using (enabled and now() between starts_at and ends_at);

insert into public.offers(name,multiplier_bps,fixed_bonus,min_recharge_paise,starts_at,ends_at,automatic,combinable,enabled)
select 'Launch 2X Credits',20000,0,5000,'2026-01-01 00:00:00+05:30','2026-09-30 23:59:59+05:30',true,false,true
where not exists(select 1 from public.offers where name='Launch 2X Credits');

create or replace function public.prepare_payment_order(target_user_id uuid,target_provider_order_id text,target_receipt text,target_amount_paise bigint,target_coupon_code text default null)
returns table(credit_amount bigint,offer_name text,coupon_code text)
language plpgsql security definer set search_path='' as $$
declare chosen_offer public.offers%rowtype;chosen_coupon public.coupons%rowtype;base_credits bigint;created_count bigint;
begin
  if target_amount_paise<5000 then raise exception 'minimum_recharge_50' using errcode='22023';end if;
  base_credits:=target_amount_paise;
  select * into chosen_offer from public.offers where enabled and automatic and now() between starts_at and ends_at and target_amount_paise>=min_recharge_paise order by multiplier_bps desc,fixed_bonus desc limit 1;
  if nullif(trim(target_coupon_code),'') is not null then
    select * into chosen_coupon from public.coupons where enabled and lower(code)=lower(trim(target_coupon_code)) and now() between starts_at and ends_at and target_amount_paise>=min_recharge_paise for update;
    if chosen_coupon.id is null then raise exception 'coupon_not_valid' using errcode='22023';end if;
    select count(*) into created_count from public.coupon_redemptions where coupon_id=chosen_coupon.id and user_id=target_user_id;
    if created_count>=chosen_coupon.max_uses_per_account then raise exception 'coupon_account_limit' using errcode='22023';end if;
    if chosen_coupon.audience='new_users' and exists(select 1 from public.payment_orders where user_id=target_user_id and status='paid') then raise exception 'coupon_new_users_only' using errcode='22023';end if;
  end if;
  if chosen_offer.id is not null then base_credits:=floor(base_credits::numeric*chosen_offer.multiplier_bps/10000)+chosen_offer.fixed_bonus;end if;
  if chosen_coupon.id is not null then
    if chosen_offer.id is not null and not(chosen_offer.combinable and chosen_coupon.combinable) then chosen_offer:=null; base_credits:=floor(target_amount_paise::numeric*chosen_coupon.multiplier_bps/10000)+chosen_coupon.fixed_bonus;
    else base_credits:=floor(base_credits::numeric*chosen_coupon.multiplier_bps/10000)+chosen_coupon.fixed_bonus;end if;
  end if;
  insert into public.payment_orders(user_id,provider_order_id,receipt,amount_paise,credit_amount,currency,status,offer_id,coupon_id)
    values(target_user_id,target_provider_order_id,target_receipt,target_amount_paise,base_credits,'INR','created',chosen_offer.id,chosen_coupon.id);
  credit_amount:=base_credits;offer_name:=chosen_offer.name;coupon_code:=chosen_coupon.code;return next;
end;
$$;

create or replace function public.record_payment_credit(target_provider_event_id text,target_event_type text,target_provider_order_id text,target_provider_payment_id text,target_status text default 'paid')
returns table(balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare target_order public.payment_orders%rowtype;chosen_coupon public.coupons%rowtype;usage_count bigint;wallet_result record;
begin
  select * into target_order from public.payment_orders where provider_order_id=target_provider_order_id for update;
  if target_order.id is null then raise exception 'payment_order_not_found' using errcode='P0002';end if;
  if target_status not in ('paid','captured') then raise exception 'payment_not_captured' using errcode='22023';end if;
  insert into public.payment_events(provider_event_id,event_type,provider_order_id,provider_payment_id,outcome) values(target_provider_event_id,target_event_type,target_provider_order_id,target_provider_payment_id,'credited') on conflict(provider_event_id) do nothing;
  if not found then select w.balance,true into balance,idempotent from public.wallets w where w.user_id=target_order.user_id;return next;return;end if;
  if target_order.coupon_id is not null then
    select * into chosen_coupon from public.coupons where id=target_order.coupon_id for update;
    select count(*) into usage_count from public.coupon_redemptions where coupon_id=chosen_coupon.id;
    if chosen_coupon.max_redemptions is not null and usage_count>=chosen_coupon.max_redemptions then raise exception 'coupon_redemption_limit' using errcode='22023';end if;
    select count(*) into usage_count from public.coupon_redemptions where coupon_id=chosen_coupon.id and user_id=target_order.user_id;
    if usage_count>=chosen_coupon.max_uses_per_account then raise exception 'coupon_account_limit' using errcode='22023';end if;
    insert into public.coupon_redemptions(coupon_id,user_id,payment_order_id) values(chosen_coupon.id,target_order.user_id,target_order.id);
  end if;
  select * into wallet_result from public.apply_wallet_entry(target_order.user_id,target_order.credit_amount,'payment_credit','Razorpay recharge','razorpay:payment:'||target_provider_payment_id,jsonb_build_object('order_id',target_provider_order_id,'payment_id',target_provider_payment_id,'offer_id',target_order.offer_id,'coupon_id',target_order.coupon_id));
  update public.payment_orders set status='paid',provider_payment_id=target_provider_payment_id,updated_at=now() where id=target_order.id;
  balance:=wallet_result.balance;idempotent:=wallet_result.idempotent;return next;
end;
$$;

revoke all on function public.prepare_payment_order(uuid,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.record_payment_credit(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_payment_order(uuid,text,text,bigint,text) to service_role;
grant execute on function public.record_payment_credit(text,text,text,text,text) to service_role;
