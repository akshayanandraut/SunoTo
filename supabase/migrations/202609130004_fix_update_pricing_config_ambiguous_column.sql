-- Fix "column reference version is ambiguous" in update_pricing_config: the UPDATE statement's
-- own SET clause `version=version+1` was ambiguous between the app_config.version column being
-- updated and the function's own `version` OUT parameter (fourth occurrence of this exact bug
-- class this session -- see 202609010002/202609060001/202609120004). The already-working sibling
-- function update_virtual_config avoids this by referencing `current_row.version+1` instead of a
-- bare `version+1`; apply the same fix here.
create or replace function public.update_pricing_config(admin_id uuid,expected_version bigint,new_value jsonb)
returns table(value jsonb,version bigint,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare current_row public.app_config%rowtype;before_value jsonb;
begin
  select * into current_row from public.app_config where key='pricing' for update;
  if current_row.key is null then raise exception 'pricing_config_not_found' using errcode='22023'; end if;
  if current_row.version<>expected_version then raise exception 'config_version_conflict' using errcode='40001'; end if;
  before_value:=current_row.value;
  update public.app_config set value=new_value,version=current_row.version+1,updated_at=now() where key='pricing' returning app_config.value,app_config.version,app_config.updated_at into value,version,updated_at;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'pricing.update','app_config','pricing',before_value,new_value);
  return next;
end;
$$;
revoke all on function public.update_pricing_config(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.update_pricing_config(uuid,bigint,jsonb) to service_role;
