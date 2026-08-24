create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  target_type text not null,
  target_ref text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
alter table public.admin_audit enable row level security;

insert into public.app_config(key,value)
values ('ads','{"enabled":false,"provider":"house","adFreeBalanceThreshold":1000,"interstitialEveryScans":5,"placements":{"top":true,"bottom":true,"desktopSide":true,"interstitial":true}}'::jsonb)
on conflict (key) do nothing;

create or replace function public.update_ad_config(admin_id uuid,expected_version bigint,new_value jsonb)
returns table(value jsonb,version bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare current_row public.app_config%rowtype;
begin
  select * into current_row from public.app_config where key='ads' for update;
  if not found then raise exception 'ad_config_missing'; end if;
  if current_row.version<>expected_version then raise exception 'config_version_conflict'; end if;
  update public.app_config set value=new_value,version=current_row.version+1,updated_at=now(),updated_by=admin_id where key='ads'
  returning app_config.value,app_config.version,app_config.updated_at into value,version,updated_at;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value)
  values(admin_id,'config.update','app_config','ads',current_row.value,new_value);
  return next;
end;$$;

revoke all on public.app_config,public.admin_audit from anon,authenticated;
revoke all on function public.update_ad_config(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.update_ad_config(uuid,bigint,jsonb) to service_role;
