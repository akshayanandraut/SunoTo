-- ACTIVATION PACK ONLY — NOT an applied migration.
-- Do not copy into supabase/migrations or execute until the central OIDC
-- registration/acceptance gates pass and the product owner approves Supabase
-- account mapping. Generate the eventual migration with `supabase migration new`.
-- This table links stable Grasany `sub` values to an existing local auth.users
-- account. It stores no email, OIDC token, entitlement, or role.

begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;

create table if not exists app_private.grasany_identity_links (
  grasany_subject text primary key check (length(btrim(grasany_subject)) between 1 and 512),
  local_user_id uuid not null unique references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now()
);

alter table app_private.grasany_identity_links enable row level security;
revoke all on table app_private.grasany_identity_links from public, anon, authenticated;
grant select, insert, update, delete on table app_private.grasany_identity_links to service_role;

comment on table app_private.grasany_identity_links is
  'Server-only mapping from verified Grasany OIDC subject to a product-local Supabase account; never an entitlement or role source.';

commit;
