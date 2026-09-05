-- Real-time activity snapshots + private (direct-sold) ad slots, admin-only.
--
-- Design intent: live "who's active where" counts live in the PresenceShard Durable Object's memory
-- (worker/src/durable/PresenceShard.js) so normal traffic never touches Postgres. Once an hour, that
-- Durable Object's alarm() fires and inserts ONE row here with the bucketed snapshot -- this is the
-- only write path into this table, so the DB never sees per-user or per-heartbeat load. The admin
-- dashboard reads history from here and live "right now" numbers straight from the Durable Object.

create table if not exists public.realtime_stats_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  sections jsonb not null default '{}'::jsonb,
  ad_stats jsonb not null default '{}'::jsonb
);
create index if not exists realtime_stats_snapshots_captured_at_idx on public.realtime_stats_snapshots(captured_at desc);
alter table public.realtime_stats_snapshots enable row level security;
revoke all on public.realtime_stats_snapshots from public,anon,authenticated;

create or replace function public.record_realtime_stats_snapshot(target_sections jsonb, target_ad_stats jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.realtime_stats_snapshots(sections, ad_stats) values (target_sections, target_ad_stats);
end;
$$;
revoke all on function public.record_realtime_stats_snapshot(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.record_realtime_stats_snapshot(jsonb,jsonb) to service_role;

-- Private (directly-sold) ads: admin configures one or more creatives per named slot (e.g. "party-top",
-- "home-banner"). The public ad-serve endpoint returns the most recently updated active row for a slot;
-- if none is active, the client falls back to the existing third-party ad provider automatically.
create table if not exists public.private_ads (
  id uuid primary key default gen_random_uuid(),
  slot text not null,
  title text not null default '',
  image_url text not null,
  target_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists private_ads_slot_active_idx on public.private_ads(slot, active, updated_at desc);
alter table public.private_ads enable row level security;
revoke all on public.private_ads from public,anon,authenticated;
