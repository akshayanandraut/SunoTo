create or replace function public.record_payment_credit(
  target_provider_event_id text,
  target_event_type text,
  target_provider_order_id text,
  target_provider_payment_id text,
  target_status text default 'paid'
) returns table(balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare
  target_order public.payment_orders%rowtype;
  existing_event public.payment_events%rowtype;
  chosen_coupon public.coupons%rowtype;
  usage_count bigint;
  wallet_result record;
begin
  if nullif(trim(target_provider_event_id),'') is null or nullif(trim(target_provider_order_id),'') is null or nullif(trim(target_provider_payment_id),'') is null then raise exception 'invalid_payment_reference' using errcode='22023';end if;
  if target_status not in ('paid','captured') then raise exception 'payment_not_captured' using errcode='22023';end if;
  select * into target_order from public.payment_orders where provider_order_id=target_provider_order_id for update;
  if target_order.id is null then raise exception 'payment_order_not_found' using errcode='P0002';end if;
  if target_order.provider_payment_id is not null and target_order.provider_payment_id<>target_provider_payment_id then raise exception 'payment_order_already_paid' using errcode='22023';end if;

  select * into existing_event from public.payment_events where provider_event_id=target_provider_event_id;
  if existing_event.id is not null then
    if existing_event.event_type<>target_event_type or existing_event.provider_order_id<>target_provider_order_id or existing_event.provider_payment_id<>target_provider_payment_id then raise exception 'idempotency_conflict' using errcode='22023';end if;
    select w.balance,true into balance,idempotent from public.wallets w where w.user_id=target_order.user_id;return next;return;
  end if;

  insert into public.payment_events(provider_event_id,event_type,provider_order_id,provider_payment_id,outcome)
    values(target_provider_event_id,target_event_type,target_provider_order_id,target_provider_payment_id,'credited') on conflict(provider_event_id) do nothing;
  if not found then
    select * into existing_event from public.payment_events where provider_event_id=target_provider_event_id;
    if existing_event.event_type<>target_event_type or existing_event.provider_order_id<>target_provider_order_id or existing_event.provider_payment_id<>target_provider_payment_id then raise exception 'idempotency_conflict' using errcode='22023';end if;
    select w.balance,true into balance,idempotent from public.wallets w where w.user_id=target_order.user_id;return next;return;
  end if;

  if target_order.status='created' and target_order.coupon_id is not null then
    select * into chosen_coupon from public.coupons where id=target_order.coupon_id for update;
    select count(*) into usage_count from public.coupon_redemptions where coupon_id=chosen_coupon.id;
    if chosen_coupon.max_redemptions is not null and usage_count>=chosen_coupon.max_redemptions then raise exception 'coupon_redemption_limit' using errcode='22023';end if;
    select count(*) into usage_count from public.coupon_redemptions where coupon_id=chosen_coupon.id and user_id=target_order.user_id;
    if usage_count>=chosen_coupon.max_uses_per_account then raise exception 'coupon_account_limit' using errcode='22023';end if;
    insert into public.coupon_redemptions(coupon_id,user_id,payment_order_id) values(chosen_coupon.id,target_order.user_id,target_order.id);
  end if;

  select * into wallet_result from public.apply_wallet_entry(target_order.user_id,target_order.credit_amount,'payment_credit','Razorpay recharge','razorpay:payment:'||target_provider_payment_id,jsonb_build_object('order_id',target_provider_order_id,'payment_id',target_provider_payment_id,'offer_id',target_order.offer_id,'coupon_id',target_order.coupon_id));
  update public.payment_orders set status=case when status in ('partially_refunded','refunded') then status else 'paid' end,provider_payment_id=target_provider_payment_id,updated_at=now() where id=target_order.id;
  balance:=wallet_result.balance;idempotent:=wallet_result.idempotent;return next;
end;
$$;

revoke all on function public.record_payment_credit(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_payment_credit(text,text,text,text,text) to service_role;
