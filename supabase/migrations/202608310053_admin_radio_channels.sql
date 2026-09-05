create or replace function public.admin_create_radio_channel(target_name text)
returns table(public_id uuid,name text,room_type text,curated_only boolean)
language plpgsql security definer set search_path='' as $$
declare
  new_room public.party_rooms%rowtype;
  slug text;
begin
  if coalesce(trim(target_name),'')='' then raise exception 'invalid_channel_name' using errcode='22023'; end if;
  slug:='channel-'||replace(gen_random_uuid()::text,'-','');
  insert into public.party_rooms(public_id,room_type,price_tier,owner_user_id,host_user_id,name,status,starts_at,ends_at,join_code,is_public,is_global,curated_only)
  values(gen_random_uuid(),'radio','basic',null,null,trim(target_name),'active',now(),now()+interval '100 years',slug,true,true,true)
  returning * into new_room;
  public_id:=new_room.public_id;name:=new_room.name;room_type:=new_room.room_type;curated_only:=new_room.curated_only;
  return next;
end;
$$;
revoke all on function public.admin_create_radio_channel(text) from public,anon,authenticated;
grant execute on function public.admin_create_radio_channel(text) to service_role;
