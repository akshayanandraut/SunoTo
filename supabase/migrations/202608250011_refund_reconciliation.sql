create unique index if not exists payment_events_provider_refund_idx
  on public.payment_events(provider_refund_id) where provider_refund_id is not null;

create or replace function public.record_payment_refund(
  target_provider_event_id text,
  target_provider_payment_id text,
  target_provider_refund_id text,
  refund_amount_paise bigint
) returns table(balance bigint,idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare
  target_order public.payment_orders%rowtype;
  existing_event public.payment_events%rowtype;
  refunded_paise bigint;
  prior_reversal bigint;
  cumulative_reversal bigint;
  credit_reversal bigint;
  wallet_result record;
begin
  if nullif(trim(target_provider_event_id),'') is null or nullif(trim(target_provider_refund_id),'') is null then raise exception 'invalid_refund_reference' using errcode='22023';end if;
  select * into target_order from public.payment_orders where provider_payment_id=target_provider_payment_id for update;
  if target_order.id is null then raise exception 'payment_order_not_found' using errcode='P0002';end if;
  if refund_amount_paise <= 0 then raise exception 'invalid_refund_amount' using errcode='22023';end if;

  select * into existing_event from public.payment_events where provider_event_id=target_provider_event_id;
  if existing_event.id is not null then
    if existing_event.event_type<>'refund.processed' or existing_event.provider_payment_id<>target_provider_payment_id or existing_event.provider_refund_id<>target_provider_refund_id or existing_event.amount_paise<>refund_amount_paise then raise exception 'idempotency_conflict' using errcode='22023';end if;
    select w.balance,true into balance,idempotent from public.wallets w where w.user_id=target_order.user_id;return next;return;
  end if;
  select * into existing_event from public.payment_events where provider_refund_id=target_provider_refund_id;
  if existing_event.id is not null then
    if existing_event.provider_payment_id<>target_provider_payment_id or existing_event.amount_paise<>refund_amount_paise then raise exception 'refund_reference_conflict' using errcode='22023';end if;
    select w.balance,true into balance,idempotent from public.wallets w where w.user_id=target_order.user_id;return next;return;
  end if;

  select coalesce(sum(amount_paise),0) into refunded_paise from public.payment_events where provider_payment_id=target_provider_payment_id and event_type='refund.processed' and outcome='reversed';
  if refunded_paise+refund_amount_paise>target_order.amount_paise then raise exception 'cumulative_refund_exceeds_payment' using errcode='22023';end if;
  prior_reversal:=floor((target_order.credit_amount::numeric*refunded_paise)/target_order.amount_paise)::bigint;
  cumulative_reversal:=floor((target_order.credit_amount::numeric*(refunded_paise+refund_amount_paise))/target_order.amount_paise)::bigint;
  credit_reversal:=cumulative_reversal-prior_reversal;

  insert into public.payment_events(provider_event_id,event_type,provider_order_id,provider_payment_id,provider_refund_id,amount_paise,outcome)
    values(target_provider_event_id,'refund.processed',target_order.provider_order_id,target_provider_payment_id,target_provider_refund_id,refund_amount_paise,'reversed');
  if credit_reversal>0 then
    select * into wallet_result from public.apply_wallet_entry(target_order.user_id,-credit_reversal,'payment_refund','Razorpay refund','razorpay:refund:'||target_provider_refund_id,jsonb_build_object('payment_id',target_provider_payment_id,'refund_id',target_provider_refund_id,'amount_paise',refund_amount_paise,'cumulative_amount_paise',refunded_paise+refund_amount_paise));
    balance:=wallet_result.balance;
  else select w.balance into balance from public.wallets w where w.user_id=target_order.user_id;
  end if;
  update public.payment_orders set status=case when refunded_paise+refund_amount_paise=amount_paise then 'refunded' else 'partially_refunded' end,updated_at=now() where id=target_order.id;
  idempotent:=false;return next;
end;
$$;

revoke all on function public.record_payment_refund(text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.record_payment_refund(text,text,text,bigint) to service_role;
