alter table public.radio_tracks add column if not exists listener_message text;

drop function if exists public.list_radio_queue(uuid);
create or replace function public.list_radio_queue(target_room_public_id uuid)
returns table(id uuid,title text,artist_name text,artwork_key text,duration_seconds integer,status text,listener_message text)
language sql security definer set search_path='' stable as $$
  select t.id,t.title,t.artist_name,t.artwork_key,t.duration_seconds,t.status,t.listener_message
  from public.radio_tracks t join public.party_rooms r on r.id=t.room_id
  where r.public_id=target_room_public_id and t.status in ('queued','playing')
  order by (t.status='playing') desc, t.sort_key asc limit 50;
$$;
revoke all on function public.list_radio_queue(uuid) from public,anon;
grant execute on function public.list_radio_queue(uuid) to authenticated;

drop function if exists public.submit_radio_track(uuid,text,text,text,text,integer,boolean);
create or replace function public.submit_radio_track(target_room_public_id uuid,target_title text,target_artist_name text,target_storage_key text,target_artwork_key text,target_duration_seconds integer,target_rights_attested boolean,target_listener_message text default null)
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
  insert into public.radio_tracks(room_id,uploader_user_id,title,artist_name,storage_key,artwork_key,duration_seconds,rights_attested,listener_message)
  values(room.id,uid,trim(target_title),nullif(trim(coalesce(target_artist_name,'')),''),target_storage_key,target_artwork_key,target_duration_seconds,true,nullif(left(trim(coalesce(target_listener_message,'')),200),''))
  returning * into new_track;
  id:=new_track.id;
  select count(*) into queue_position from public.radio_tracks t where t.room_id=room.id and t.status='queued' and t.created_at<=new_track.created_at;
  return next;
end;
$$;
revoke all on function public.submit_radio_track(uuid,text,text,text,text,integer,boolean,text) from public,anon;
grant execute on function public.submit_radio_track(uuid,text,text,text,text,integer,boolean,text) to authenticated;

drop function if exists public.next_radio_track(uuid);
create or replace function public.next_radio_track(target_room_public_id uuid)
returns table(id uuid,title text,artist_name text,storage_key text,artwork_key text,duration_seconds integer,curated_only boolean,listener_message text)
language plpgsql security definer set search_path='' as $$
declare
  room public.party_rooms%rowtype;
  picked public.radio_tracks%rowtype;
  sibling_title text;
begin
  select * into room from public.party_rooms r where r.public_id=target_room_public_id and r.room_type='radio';
  if room.id is null then return; end if;

  update public.radio_tracks set status='removed' where room_id=room.id and status='playing';

  if room.is_global then
    select t.title into sibling_title from public.radio_tracks t join public.party_rooms r2 on r2.id=t.room_id
    where r2.is_global and r2.id<>room.id and r2.status='active' and t.status='playing' limit 1;
  end if;

  select * into picked from public.radio_tracks t where t.room_id=room.id and t.status='queued'
    and (sibling_title is null or lower(t.title)<>lower(sibling_title))
    order by t.sort_key asc limit 1 for update skip locked;

  if picked.id is null then
    select * into picked from public.radio_tracks t where t.room_id=room.id and t.status='queued' order by t.sort_key asc limit 1 for update skip locked;
  end if;

  if picked.id is null and room.curated_only then
    update public.radio_tracks set status='queued',sort_key=random() where room_id=room.id and status in ('played','removed');
    select * into picked from public.radio_tracks t where t.room_id=room.id and t.status='queued'
      and (sibling_title is null or lower(t.title)<>lower(sibling_title))
      order by t.sort_key asc limit 1 for update skip locked;
    if picked.id is null then
      select * into picked from public.radio_tracks t where t.room_id=room.id and t.status='queued' order by t.sort_key asc limit 1 for update skip locked;
    end if;
  end if;

  if picked.id is null then return; end if;

  update public.radio_tracks set status='playing' where radio_tracks.id=picked.id;
  id:=picked.id;title:=picked.title;artist_name:=picked.artist_name;storage_key:=picked.storage_key;artwork_key:=picked.artwork_key;duration_seconds:=picked.duration_seconds;curated_only:=room.curated_only;listener_message:=picked.listener_message;
  return next;
end;
$$;
revoke all on function public.next_radio_track(uuid) from public,anon,authenticated;
grant execute on function public.next_radio_track(uuid) to service_role;

drop function if exists public.list_public_radio_rooms();
create or replace function public.list_public_radio_rooms()
returns table(public_id uuid,name text,join_code text,room_type text,now_playing_title text,now_playing_artist text,curated_only boolean,artist_spotify_url text,artist_apple_music_url text)
language sql security definer set search_path='' stable as $$
  select r.public_id,r.name,r.join_code,r.room_type,t.title,t.artist_name,r.curated_only,r.artist_spotify_url,r.artist_apple_music_url
  from public.party_rooms r
  left join lateral (
    select title,artist_name from public.radio_tracks rt where rt.room_id=r.id and rt.status='playing' limit 1
  ) t on true
  where r.is_public and r.status='active' and r.room_type='radio'
  order by r.is_global desc,r.curated_only desc,r.created_at desc limit 50;
$$;
revoke all on function public.list_public_radio_rooms() from public,anon;
grant execute on function public.list_public_radio_rooms() to authenticated;
