create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  entry_type text not null,
  reason text not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wallet_ledger_user_created_idx on public.wallet_ledger(user_id, created_at desc);

insert into public.wallets(user_id) select id from auth.users on conflict (user_id) do nothing;
create or replace function public.handle_new_wallet() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.wallets(user_id) values(new.id) on conflict(user_id) do nothing;return new;end;
$$;
drop trigger if exists on_auth_user_wallet_created on auth.users;
create trigger on_auth_user_wallet_created after insert on auth.users for each row execute function public.handle_new_wallet();

alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
revoke all on public.wallets from anon, authenticated;
revoke all on public.wallet_ledger from anon, authenticated;
grant select on public.wallets to authenticated;
grant select on public.wallet_ledger to authenticated;
create policy "users read own wallet" on public.wallets for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read own ledger" on public.wallet_ledger for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.apply_wallet_entry(target_user_id uuid,credit_delta bigint,ledger_type text,ledger_reason text,ledger_idempotency_key text,ledger_metadata jsonb default '{}'::jsonb)
returns table(ledger_id bigint,balance bigint,idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare existing public.wallet_ledger%rowtype;current_balance bigint;
begin
  if credit_delta = 0 then raise exception 'zero_wallet_delta' using errcode='22023';end if;
  if ledger_idempotency_key is null or length(ledger_idempotency_key) < 8 then raise exception 'invalid_idempotency_key' using errcode='22023';end if;
  select * into existing from public.wallet_ledger where idempotency_key=ledger_idempotency_key;
  if existing.id is not null then
    if existing.user_id<>target_user_id or existing.delta<>credit_delta or existing.entry_type<>ledger_type then raise exception 'idempotency_conflict' using errcode='22023';end if;
    return query select existing.id,existing.balance_after,true;return;
  end if;
  insert into public.wallets(user_id) values(target_user_id) on conflict(user_id) do nothing;
  select w.balance into current_balance from public.wallets w where w.user_id=target_user_id for update;
  select * into existing from public.wallet_ledger where idempotency_key=ledger_idempotency_key;
  if existing.id is not null then
    if existing.user_id<>target_user_id or existing.delta<>credit_delta or existing.entry_type<>ledger_type then raise exception 'idempotency_conflict' using errcode='22023';end if;
    return query select existing.id,existing.balance_after,true;return;
  end if;
  if current_balance+credit_delta<0 then raise exception 'insufficient_credits' using errcode='P0001';end if;
  current_balance:=current_balance+credit_delta;
  update public.wallets w set balance=current_balance,version=w.version+1,updated_at=now() where w.user_id=target_user_id;
  insert into public.wallet_ledger(user_id,delta,balance_after,entry_type,reason,idempotency_key,metadata) values(target_user_id,credit_delta,current_balance,ledger_type,ledger_reason,ledger_idempotency_key,coalesce(ledger_metadata,'{}'::jsonb)) returning id into ledger_id;
  balance:=current_balance;idempotent:=false;return next;
end;
$$;
revoke all on function public.apply_wallet_entry(uuid,bigint,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_wallet_entry(uuid,bigint,text,text,text,jsonb) to service_role;
