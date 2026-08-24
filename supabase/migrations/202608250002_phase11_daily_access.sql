create table if not exists public.daily_entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_day date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  wallet_ledger_id bigint not null references public.wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(user_id,access_day)
);
create index if not exists daily_entitlements_active_idx on public.daily_entitlements(user_id,ends_at desc);
alter table public.daily_entitlements enable row level security;
revoke all on public.daily_entitlements from anon,authenticated;
grant select on public.daily_entitlements to authenticated;
create policy "users read own daily access" on public.daily_entitlements for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.activate_daily_access(target_user_id uuid,activation_time timestamptz default now())
returns table(starts_at timestamptz,ends_at timestamptz,balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare local_time timestamp;local_day date;entitlement_end timestamptz;existing public.daily_entitlements%rowtype;wallet_result record;verified boolean;has_recharged boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text,0));
  select email_confirmed_at is not null into verified from auth.users where id=target_user_id;
  if not coalesce(verified,false) then raise exception 'email_verification_required' using errcode='22023';end if;
  select exists(select 1 from public.wallet_ledger where user_id=target_user_id and entry_type='payment_credit') into has_recharged;
  if not has_recharged then raise exception 'recharge_required' using errcode='22023';end if;
  select e.* into existing from public.daily_entitlements e where e.user_id=target_user_id and activation_time>=e.starts_at and activation_time<e.ends_at order by e.ends_at desc limit 1;
  if existing.id is not null then select w.balance into balance from public.wallets w where w.user_id=target_user_id;starts_at:=existing.starts_at;ends_at:=existing.ends_at;idempotent:=true;return next;return;end if;
  local_time:=activation_time at time zone 'Asia/Kolkata';local_day:=local_time::date;
  entitlement_end:=case when local_time::time>=time '22:00' then ((local_day+2)::timestamp at time zone 'Asia/Kolkata') else ((local_day+1)::timestamp at time zone 'Asia/Kolkata') end;
  select * into wallet_result from public.apply_wallet_entry(target_user_id,-200,'daily_access','Daily random chat access','daily-access:'||target_user_id::text||':'||local_day::text,jsonb_build_object('access_day',local_day,'ends_at',entitlement_end));
  insert into public.daily_entitlements(user_id,access_day,starts_at,ends_at,wallet_ledger_id) values(target_user_id,local_day,activation_time,entitlement_end,wallet_result.ledger_id) returning daily_entitlements.starts_at,daily_entitlements.ends_at into starts_at,ends_at;
  balance:=wallet_result.balance;idempotent:=wallet_result.idempotent;return next;
end;
$$;
revoke all on function public.activate_daily_access(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.activate_daily_access(uuid,timestamptz) to service_role;
