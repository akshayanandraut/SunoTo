-- Fix "column reference item_id is ambiguous" in purchase_store_item: the store_purchases lookup
-- collided with the function's own item_id OUT parameter (same bug class as
-- 202609010002_fix_ad_earning_ambiguous_column.sql and 202609060001_fix_request_verification_
-- ambiguous_column.sql — third time this exact pattern has bitten a `returns table(...)` function
-- whose OUT parameter name matches a column name it queries against). Qualify with a table alias.
create or replace function public.purchase_store_item(target_user_id uuid,target_item_id smallint,target_idempotency_key text)
returns table(balance bigint,item_id smallint,idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare
  item public.store_items%rowtype;
  existing public.store_purchases%rowtype;
  wallet_result record;
begin
  select * into item from public.store_items where id=target_item_id and active;
  if not found then raise exception 'invalid_store_item' using errcode='22023'; end if;

  select sp.* into existing from public.store_purchases sp where sp.user_id=target_user_id and sp.item_id=target_item_id;
  if existing.id is not null then
    select w.balance into balance from public.wallets w where w.user_id=target_user_id;
    item_id:=target_item_id;idempotent:=true;
    return next;return;
  end if;

  select * into wallet_result from public.apply_wallet_entry(target_user_id,-item.price_credits,'store_purchase','Store purchase: '||item.name,target_idempotency_key,jsonb_build_object('item_id',target_item_id,'sku',item.sku));
  insert into public.store_purchases(user_id,item_id,wallet_ledger_id) values(target_user_id,target_item_id,wallet_result.ledger_id);
  balance:=wallet_result.balance;item_id:=target_item_id;idempotent:=false;
  return next;
end;
$$;
revoke all on function public.purchase_store_item(uuid,smallint,text) from public,anon,authenticated;
grant execute on function public.purchase_store_item(uuid,smallint,text) to service_role;
