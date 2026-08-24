create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  reason text,
  status text not null default 'pending' check(status in ('pending','processing','completed','rejected')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists one_open_deletion_request_per_user on public.account_deletion_requests(user_id) where status in ('pending','processing');
create table if not exists public.grievances (
  id uuid primary key default gen_random_uuid(),
  email text not null check(length(email) between 5 and 320),
  category text not null check(category in ('privacy','safety','account','payment','content','other')),
  description text not null check(length(description) between 20 and 2000),
  status text not null default 'received' check(status in ('received','acknowledged','in_review','resolved','rejected')),
  received_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
alter table public.account_deletion_requests enable row level security;
alter table public.grievances enable row level security;
revoke all on public.account_deletion_requests,public.grievances from anon,authenticated;

create or replace function public.request_account_deletion(target_user_id uuid,target_reason text default null)
returns table(id uuid,status text,requested_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
  if target_user_id is null then raise exception 'authentication_required';end if;
  insert into public.account_deletion_requests(user_id,reason) values(target_user_id,left(nullif(trim(target_reason),''),500)) on conflict(user_id) where status in ('pending','processing') do update set reason=coalesce(excluded.reason,account_deletion_requests.reason) returning account_deletion_requests.id,account_deletion_requests.status,account_deletion_requests.requested_at into id,status,requested_at;return next;
end;$$;

create or replace function public.cleanup_operational_retention()
returns jsonb language plpgsql security definer set search_path='' as $$
declare analytics_keys_deleted bigint;expired_grievances_deleted bigint;
begin
  delete from public.analytics_event_keys where created_at<now()-interval '35 days';get diagnostics analytics_keys_deleted=row_count;
  delete from public.grievances where status in ('resolved','rejected') and coalesce(resolved_at,received_at)<now()-interval '3 years';get diagnostics expired_grievances_deleted=row_count;
  return jsonb_build_object('analyticsKeysDeleted',analytics_keys_deleted,'expiredGrievancesDeleted',expired_grievances_deleted);
end;$$;

create or replace function public.admin_update_grievance(admin_id uuid,target_id uuid,new_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;
begin
  if new_status not in ('acknowledged','in_review','resolved','rejected') then raise exception 'invalid_grievance_status';end if;
  select to_jsonb(g) into before_row from public.grievances g where id=target_id for update;if before_row is null then raise exception 'grievance_not_found';end if;
  update public.grievances set status=new_status,acknowledged_at=case when new_status in ('acknowledged','in_review','resolved') then coalesce(acknowledged_at,now()) else acknowledged_at end,resolved_at=case when new_status in ('resolved','rejected') then now() else null end where id=target_id;
  select to_jsonb(g) into after_row from public.grievances g where id=target_id;insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'grievance.'||new_status,'grievance',target_id::text,before_row,after_row);return after_row;
end;$$;

revoke all on function public.request_account_deletion(uuid,text),function public.cleanup_operational_retention(),function public.admin_update_grievance(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_account_deletion(uuid,text),function public.cleanup_operational_retention(),function public.admin_update_grievance(uuid,uuid,text) to service_role;
grant insert on public.grievances to service_role;
