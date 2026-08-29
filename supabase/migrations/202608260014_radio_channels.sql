alter table public.party_rooms alter column owner_user_id drop not null;
alter table public.party_rooms add column if not exists is_global boolean not null default false;
alter table public.party_rooms add column if not exists curated_only boolean not null default false;
alter table public.radio_tracks alter column uploader_user_id drop not null;

insert into public.party_rooms(public_id,room_type,price_tier,owner_user_id,host_user_id,name,status,starts_at,ends_at,join_code,is_public,is_global,curated_only)
values('00000000-0000-0000-0000-000000000001','radio','basic',null,null,'SunoTo Radio','active',now(),now()+interval '100 years','sunoto-featured',true,true,true)
on conflict (public_id) do nothing;

insert into public.party_rooms(public_id,room_type,price_tier,owner_user_id,host_user_id,name,status,starts_at,ends_at,join_code,is_public,is_global,curated_only)
values('00000000-0000-0000-0000-000000000002','radio','basic',null,null,'SunoTo Public Radio','active',now(),now()+interval '100 years','sunoto-public',true,true,false)
on conflict (public_id) do nothing;

create or replace function public.submit_radio_track(target_room_public_id uuid,target_title text,target_artist_name text,target_storage_key text,target_artwork_key text,target_duration_seconds integer,target_rights_attested boolean)
returns table(id uuid,queue_position bigint)
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  room public.party_rooms%rowtype;
  new_track public.radio_tracks%rowtype;
  recent_count integer;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if not target_rights_attested then raise exception 'rights_attestation_required' using errcode='22023'; end if;
  if coalesce(trim(target_title),'')='' then raise exception 'invalid_track_title' using errcode='22023'; end if;
  if target_duration_seconds<30 or target_duration_seconds>900 then raise exception 'invalid_track_duration' using errcode='22023'; end if;
  select * into room from public.party_rooms r where r.public_id=target_room_public_id and r.status='active' and r.room_type='radio';
  if room.id is null then raise exception 'radio_room_not_found' using errcode='22023'; end if;
  if room.curated_only then raise exception 'channel_curated_only' using errcode='42501'; end if;
  select count(*) into recent_count from public.radio_tracks t where t.uploader_user_id=uid and t.created_at>now()-interval '30 minutes';
  if recent_count>0 then raise exception 'submission_rate_limited' using errcode='42901'; end if;
  insert into public.radio_tracks(room_id,uploader_user_id,title,artist_name,storage_key,artwork_key,duration_seconds,rights_attested)
  values(room.id,uid,trim(target_title),nullif(trim(coalesce(target_artist_name,'')),''),target_storage_key,target_artwork_key,target_duration_seconds,true)
  returning * into new_track;
  id:=new_track.id;
  select count(*) into queue_position from public.radio_tracks t where t.room_id=room.id and t.status='queued' and t.created_at<=new_track.created_at;
  return next;
end;
$$;
revoke all on function public.submit_radio_track(uuid,text,text,text,text,integer,boolean) from public,anon;
grant execute on function public.submit_radio_track(uuid,text,text,text,text,integer,boolean) to authenticated;

create or replace function public.admin_submit_radio_track(target_room_public_id uuid,target_title text,target_artist_name text,target_storage_key text,target_artwork_key text,target_duration_seconds integer)
returns table(id uuid)
language plpgsql security definer set search_path='' as $$
declare
  room public.party_rooms%rowtype;
  new_track public.radio_tracks%rowtype;
begin
  if coalesce(trim(target_title),'')='' then raise exception 'invalid_track_title' using errcode='22023'; end if;
  if target_duration_seconds<30 or target_duration_seconds>900 then raise exception 'invalid_track_duration' using errcode='22023'; end if;
  select * into room from public.party_rooms r where r.public_id=target_room_public_id and r.status='active' and r.room_type='radio';
  if room.id is null then raise exception 'radio_room_not_found' using errcode='22023'; end if;
  insert into public.radio_tracks(room_id,uploader_user_id,title,artist_name,storage_key,artwork_key,duration_seconds,rights_attested)
  values(room.id,null,trim(target_title),nullif(trim(coalesce(target_artist_name,'')),''),target_storage_key,target_artwork_key,target_duration_seconds,true)
  returning * into new_track;
  id:=new_track.id;
  return next;
end;
$$;
revoke all on function public.admin_submit_radio_track(uuid,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.admin_submit_radio_track(uuid,text,text,text,text,integer) to service_role;

drop function if exists public.list_public_radio_rooms();

create or replace function public.list_public_radio_rooms()
returns table(public_id uuid,name text,join_code text,room_type text,now_playing_title text,now_playing_artist text)
language sql security definer set search_path='' stable as $$
  select r.public_id,r.name,r.join_code,r.room_type,t.title,t.artist_name
  from public.party_rooms r
  left join lateral (
    select title,artist_name from public.radio_tracks rt where rt.room_id=r.id and rt.status='playing' limit 1
  ) t on true
  where r.is_public and r.status='active' and r.room_type='radio'
  order by r.is_global desc,r.curated_only desc,r.created_at desc limit 50;
$$;
revoke all on function public.list_public_radio_rooms() from public,anon;
grant execute on function public.list_public_radio_rooms() to authenticated;

create or replace function public.list_radio_channels()
returns table(public_id uuid,name text,room_type text,curated_only boolean)
language sql security definer set search_path='' stable as $$
  select public_id,name,room_type,curated_only from public.party_rooms
  where is_global and status='active' and room_type='radio'
  order by curated_only desc;
$$;
revoke all on function public.list_radio_channels() from public,anon;
grant execute on function public.list_radio_channels() to authenticated;
