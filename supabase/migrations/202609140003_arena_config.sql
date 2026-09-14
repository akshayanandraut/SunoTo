-- T-097 (OPUS_DECISIONS.md Decision C2): Arena's lobby capacity needs to be tunable without a
-- deploy. One config row, one admin-audited update RPC -- same pattern as pricing/flags/etc.
insert into public.app_config(key,value,version)
values('arena','{"maxPlayers":24}'::jsonb,1)
on conflict (key) do nothing;

-- Written directly with `current_row.version+1` and qualified RETURNING columns from the start --
-- see 202609130004_fix_update_pricing_config_ambiguous_column.sql for why a bare `version=version+1`
-- is ambiguous in this exact shape of function (this bug class has recurred four times already).
create or replace function public.update_arena_config(admin_id uuid,expected_version bigint,new_value jsonb)
returns table(value jsonb,version bigint,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare current_row public.app_config%rowtype;before_value jsonb;
begin
  select * into current_row from public.app_config where key='arena' for update;
  if current_row.key is null then raise exception 'arena_config_not_found' using errcode='22023'; end if;
  if current_row.version<>expected_version then raise exception 'config_version_conflict' using errcode='40001'; end if;
  before_value:=current_row.value;
  update public.app_config set value=new_value,version=current_row.version+1,updated_at=now() where key='arena' returning app_config.value,app_config.version,app_config.updated_at into value,version,updated_at;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'arena.update','app_config','arena',before_value,new_value);
  return next;
end;
$$;
revoke all on function public.update_arena_config(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.update_arena_config(uuid,bigint,jsonb) to service_role;
