create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id text not null unique,
  receipt text not null unique,
  amount_paise bigint not null check (amount_paise >= 5000),
  credit_amount bigint not null check (credit_amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created',
  provider_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  provider_event_id text not null unique,
  event_type text not null,
  provider_order_id text,
  provider_payment_id text,
  provider_refund_id text,
  amount_paise bigint,
  outcome text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists payment_orders_provider_payment_idx on public.payment_orders(provider_payment_id) where provider_payment_id is not null;

alter table public.payment_orders enable row level security;
alter table public.payment_events enable row level security;
revoke all on public.payment_orders from anon, authenticated;
revoke all on public.payment_events from anon, authenticated;
grant select on public.payment_orders to authenticated;
create policy "users read own payment orders" on public.payment_orders for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.record_payment_credit(
  target_provider_event_id text,
  target_event_type text,
  target_provider_order_id text,
  target_provider_payment_id text,
  target_status text default 'paid'
) returns table(balance bigint,idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare target_order public.payment_orders%rowtype;wallet_result record;
begin
  select * into target_order from public.payment_orders where provider_order_id=target_provider_order_id for update;
  if target_order.id is null then raise exception 'payment_order_not_found' using errcode='P0002';end if;
  if target_status not in ('paid','captured') then raise exception 'payment_not_captured' using errcode='22023';end if;
  insert into public.payment_events(provider_event_id,event_type,provider_order_id,provider_payment_id,outcome)
    values(target_provider_event_id,target_event_type,target_provider_order_id,target_provider_payment_id,'credited')
    on conflict(provider_event_id) do nothing;
  if not found then
    select w.balance,true into balance,idempotent from public.wallets w where w.user_id=target_order.user_id;return next;return;
  end if;
  select * into wallet_result from public.apply_wallet_entry(target_order.user_id,target_order.credit_amount,'payment_credit','Razorpay recharge','razorpay:payment:'||target_provider_payment_id,jsonb_build_object('order_id',target_provider_order_id,'payment_id',target_provider_payment_id));
  update public.payment_orders set status='paid',provider_payment_id=target_provider_payment_id,updated_at=now() where id=target_order.id;
  balance:=wallet_result.balance;idempotent:=wallet_result.idempotent;return next;
end;
$$;

create or replace function public.record_payment_refund(
  target_provider_event_id text,
  target_provider_payment_id text,
  target_provider_refund_id text,
  refund_amount_paise bigint
) returns table(balance bigint,idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare target_order public.payment_orders%rowtype;credit_reversal bigint;wallet_result record;
begin
  select * into target_order from public.payment_orders where provider_payment_id=target_provider_payment_id for update;
  if target_order.id is null then raise exception 'payment_order_not_found' using errcode='P0002';end if;
  if refund_amount_paise <= 0 or refund_amount_paise > target_order.amount_paise then raise exception 'invalid_refund_amount' using errcode='22023';end if;
  credit_reversal:=floor((target_order.credit_amount::numeric*refund_amount_paise)/target_order.amount_paise)::bigint;
  if credit_reversal=0 then raise exception 'refund_too_small' using errcode='22023';end if;
  insert into public.payment_events(provider_event_id,event_type,provider_order_id,provider_payment_id,provider_refund_id,amount_paise,outcome)
    values(target_provider_event_id,'refund.processed',target_order.provider_order_id,target_provider_payment_id,target_provider_refund_id,refund_amount_paise,'reversed')
    on conflict(provider_event_id) do nothing;
  if not found then
    select w.balance,true into balance,idempotent from public.wallets w where w.user_id=target_order.user_id;return next;return;
  end if;
  select * into wallet_result from public.apply_wallet_entry(target_order.user_id,-credit_reversal,'payment_refund','Razorpay refund','razorpay:refund:'||target_provider_refund_id,jsonb_build_object('payment_id',target_provider_payment_id,'refund_id',target_provider_refund_id,'amount_paise',refund_amount_paise));
  update public.payment_orders set status=case when refund_amount_paise=amount_paise then 'refunded' else 'partially_refunded' end,updated_at=now() where id=target_order.id;
  balance:=wallet_result.balance;idempotent:=wallet_result.idempotent;return next;
end;
$$;

revoke all on function public.record_payment_credit(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.record_payment_refund(text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.record_payment_credit(text,text,text,text,text) to service_role;
grant execute on function public.record_payment_refund(text,text,text,bigint) to service_role;
