-- Membership becomes a days-of-access grant rather than a permanent flip: paying for a membership
-- level extends premium_expires_at by that many days, and a periodic sweep (worker cron, every 10
-- minutes, same job that draws jackpots/settles trivia) flips is_premium back off once it lapses.
-- admin_set_premium (existing) still exists for manual lifetime grant/revoke -- granting via that path
-- clears premium_expires_at (no auto-expiry), consistent with its pre-existing behaviour.
alter table public.profiles add column if not exists premium_expires_at timestamptz;

create or replace function public.admin_set_premium(admin_id uuid,target_user_id uuid,premium boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare before_row jsonb;after_row jsonb;
begin
  select to_jsonb(p) into before_row from public.profiles p where user_id=target_user_id for update;
  if before_row is null then raise exception 'profile_missing'; end if;
  update public.profiles set is_premium=premium,premium_expires_at=null,updated_at=now() where user_id=target_user_id;
  select to_jsonb(p) into after_row from public.profiles p where user_id=target_user_id;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'premium.'||(case when premium then 'grant' else 'revoke' end),'user',target_user_id::text,before_row,after_row);
  return after_row;
end;
$$;
revoke all on function public.admin_set_premium(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_set_premium(uuid,uuid,boolean) to service_role;

create or replace function public.admin_grant_premium_days(admin_id uuid,target_user_id uuid,days int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare before_row jsonb;after_row jsonb;current_profile public.profiles%rowtype;
begin
  if days is null or days <= 0 or days > 3650 then raise exception 'invalid_days' using errcode='22023'; end if;
  select * into current_profile from public.profiles where user_id=target_user_id for update;
  if current_profile.user_id is null then raise exception 'profile_missing'; end if;
  before_row := to_jsonb(current_profile);
  update public.profiles set is_premium=true,premium_expires_at=greatest(now(),coalesce(premium_expires_at,now())) + make_interval(days=>days),updated_at=now() where user_id=target_user_id;
  select to_jsonb(p) into after_row from public.profiles p where user_id=target_user_id;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'premium.grant_days','user',target_user_id::text,before_row,after_row);
  return after_row;
end;
$$;
revoke all on function public.admin_grant_premium_days(uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.admin_grant_premium_days(uuid,uuid,int) to service_role;

create or replace function public.expire_premium_memberships()
returns int
language plpgsql security definer set search_path = '' as $$
declare expired_count int;
begin
  update public.profiles set is_premium=false,updated_at=now()
    where is_premium=true and premium_expires_at is not null and premium_expires_at <= now();
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;
revoke all on function public.expire_premium_memberships() from public,anon,authenticated;
grant execute on function public.expire_premium_memberships() to service_role;
