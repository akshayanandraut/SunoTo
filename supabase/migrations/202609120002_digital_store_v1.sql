-- Store v1 (T-060/T-061): platform-owned digital cosmetic goods catalog, Sparks/Credits-only.
-- No user-to-user resale, no real-money payout to third parties — architecturally identical to
-- how Premium/Streaming membership already sell for Sparks, just a different SKU type (profile
-- badges). See QUESTIONS.md "Store page v1 scope" for why a marketplace design was rejected.

create table if not exists public.store_items (
  id smallint primary key,
  sku text not null unique,
  name text not null,
  description text not null default '',
  icon text not null,
  price_credits bigint not null check (price_credits > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.store_items enable row level security;
revoke all on public.store_items from anon, authenticated;
grant select on public.store_items to authenticated, anon;
create policy "anyone reads active store items" on public.store_items for select to authenticated, anon using (active);

create table if not exists public.store_purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id smallint not null references public.store_items(id) on delete restrict,
  wallet_ledger_id bigint not null references public.wallet_ledger(id) on delete restrict,
  purchased_at timestamptz not null default now(),
  unique(user_id,item_id)
);
alter table public.store_purchases enable row level security;
revoke all on public.store_purchases from anon, authenticated;

alter table public.profiles add column if not exists equipped_badge_item_id smallint references public.store_items(id) on delete set null;

insert into public.store_items(id,sku,name,description,icon,price_credits) values
  (1,'badge_star_supporter','Star Supporter','A star badge next to your name.','⭐',500),
  (2,'badge_trendsetter','Trendsetter','Show you were here early.','🔥',750),
  (3,'badge_butterfly','Butterfly','A little flair for your profile.','🦋',400),
  (4,'badge_crown','Crown','The rare, premium-feel badge.','👑',1500),
  (5,'badge_rainbow','Rainbow','Colorful and proud.','🌈',600)
on conflict (id) do nothing;

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

  select * into existing from public.store_purchases where user_id=target_user_id and item_id=target_item_id;
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

create or replace function public.equip_store_item(target_user_id uuid,target_item_id smallint)
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare owned boolean;result public.profiles%rowtype;
begin
  if target_item_id is not null then
    select exists(select 1 from public.store_purchases where user_id=target_user_id and item_id=target_item_id) into owned;
    if not owned then raise exception 'item_not_owned' using errcode='22023'; end if;
  end if;
  update public.profiles set equipped_badge_item_id=target_item_id where user_id=target_user_id returning * into result;
  return result;
end;
$$;
revoke all on function public.equip_store_item(uuid,smallint) from public,anon,authenticated;
grant execute on function public.equip_store_item(uuid,smallint) to service_role;

create or replace function public.admin_upsert_store_item(admin_id uuid,item jsonb)
returns public.store_items
language plpgsql security definer set search_path = '' as $$
declare before_row jsonb;after_row public.store_items%rowtype;
begin
  if coalesce((item->>'price_credits')::bigint,0)<=0 then raise exception 'invalid_price' using errcode='22023';end if;
  if coalesce(trim(item->>'name'),'')='' or coalesce(trim(item->>'sku'),'')='' or coalesce(trim(item->>'icon'),'')='' then raise exception 'invalid_item_fields' using errcode='22023';end if;
  select to_jsonb(s) into before_row from public.store_items s where id=(item->>'id')::smallint;
  insert into public.store_items(id,sku,name,description,icon,price_credits,active)
    values(
      coalesce((item->>'id')::smallint,(select coalesce(max(id),0)+1 from public.store_items)),
      item->>'sku',item->>'name',coalesce(item->>'description',''),item->>'icon',(item->>'price_credits')::bigint,coalesce((item->>'active')::boolean,true)
    )
    on conflict (id) do update set sku=excluded.sku,name=excluded.name,description=excluded.description,icon=excluded.icon,price_credits=excluded.price_credits,active=excluded.active,updated_at=now()
    returning * into after_row;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'store.item.upsert','store_item',after_row.id::text,before_row,to_jsonb(after_row));
  return after_row;
end;
$$;
revoke all on function public.admin_upsert_store_item(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_upsert_store_item(uuid,jsonb) to service_role;
