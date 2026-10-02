-- One product-local operational heartbeat row. No customer or chat data.
-- This migration is reviewed source only until applied to the dedicated
-- SunoTo Supabase project through the normal migration gate.
begin;

create schema if not exists grasany_ops;
revoke all on schema grasany_ops from public, anon, authenticated;
grant usage on schema grasany_ops to service_role;

create table grasany_ops.heartbeat (
  product_id text primary key check (product_id = 'sunoto'),
  counter bigint not null default 0 check (counter >= 0),
  last_probe_id uuid,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);

alter table grasany_ops.heartbeat enable row level security;
revoke all on table grasany_ops.heartbeat from public, anon, authenticated;
grant select, insert, update on table grasany_ops.heartbeat to service_role;

-- A single RPC keeps all three stages within one Postgres transaction and
-- serializes every SunoTo probe on a transaction-scoped advisory lock.
create function public.sunoto_heartbeat_probe(probe_id uuid)
returns table (
  status text,
  read_before text,
  write text,
  read_after text,
  counter bigint,
  last_probe_id uuid
)
language plpgsql volatile security invoker
set search_path = ''
set statement_timeout = '4000ms'
set lock_timeout = '1000ms'
as $$
declare
  before_counter bigint := 0;
  before_probe_id uuid;
  after_counter bigint;
  after_probe_id uuid;
begin
  status := 'error';
  read_before := 'failed';
  write := 'skipped';
  read_after := 'skipped';
  if probe_id is null then return next; return; end if;
  if not pg_catalog.pg_try_advisory_xact_lock(41020, 1) then return next; return; end if;

  select h.counter, h.last_probe_id into before_counter, before_probe_id
    from grasany_ops.heartbeat as h
   where h.product_id = 'sunoto';
  if not found then before_counter := 0; end if;
  read_before := 'ok';
  if before_probe_id = probe_id then return next; return; end if;
  write := 'failed';

  insert into grasany_ops.heartbeat as h (product_id, counter, last_probe_id, checked_at)
  values ('sunoto', before_counter + 1, probe_id, now())
  on conflict (product_id) do update
    set counter = h.counter + 1,
        last_probe_id = excluded.last_probe_id,
        checked_at = excluded.checked_at
    where h.counter = before_counter
  returning h.counter, h.last_probe_id into after_counter, after_probe_id;
  if not found or after_counter <> before_counter + 1 or after_probe_id <> probe_id then
    raise exception 'heartbeat_write_mismatch';
  end if;
  write := 'ok';
  read_after := 'failed';

  select h.counter, h.last_probe_id into after_counter, after_probe_id
    from grasany_ops.heartbeat as h
   where h.product_id = 'sunoto';
  if not found or after_counter <> before_counter + 1 or after_probe_id <> probe_id then
    raise exception 'heartbeat_readback_mismatch';
  end if;
  read_after := 'ok';
  status := 'ok';
  counter := after_counter;
  last_probe_id := after_probe_id;
  return next;
exception when others then
  -- PL/pgSQL rolls back the block's insert/update before returning this
  -- stage-only result. Never return SQL text or a partial success.
  status := 'error';
  if write = 'ok' then write := 'failed'; end if;
  counter := null;
  last_probe_id := null;
  return next;
end;
$$;

revoke all on function public.sunoto_heartbeat_probe(uuid) from public, anon, authenticated;
grant execute on function public.sunoto_heartbeat_probe(uuid) to service_role;

comment on table grasany_ops.heartbeat is 'Exactly one SunoTo operational probe row; no customer data.';
commit;
