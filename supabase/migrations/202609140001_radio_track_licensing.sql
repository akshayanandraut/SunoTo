-- Admin-curated radio tracks must carry a known-commercial-safe license and visible attribution
-- (Decision A in OPUS_DECISIONS.md: no Suno scraping, curated royalty-free import only, CC-BY-style
-- licenses legally require visible credit). Public user submissions are untouched -- those stay
-- governed by the existing rights_attested self-declaration, license/attribution stay null there.
alter table public.radio_tracks add column if not exists license text;
alter table public.radio_tracks add column if not exists attribution_text text;
alter table public.radio_tracks drop constraint if exists radio_tracks_license_allowed;
alter table public.radio_tracks add constraint radio_tracks_license_allowed check (license is null or license in ('cc0','cc-by','pixabay','ccmixter','fma-cc-by','fma-cc0'));

drop function if exists public.admin_submit_radio_track(uuid,text,text,text,text,integer);
create or replace function public.admin_submit_radio_track(target_room_public_id uuid,target_title text,target_artist_name text,target_storage_key text,target_artwork_key text,target_duration_seconds integer,target_license text,target_attribution_text text)
returns table(id uuid)
language plpgsql security definer set search_path='' as $$
declare
  room public.party_rooms%rowtype;
  new_track public.radio_tracks%rowtype;
begin
  if coalesce(trim(target_title),'')='' then raise exception 'invalid_track_title' using errcode='22023'; end if;
  if target_duration_seconds<30 or target_duration_seconds>900 then raise exception 'invalid_track_duration' using errcode='22023'; end if;
  if coalesce(trim(target_license),'') not in ('cc0','cc-by','pixabay','ccmixter','fma-cc-by','fma-cc0') then raise exception 'invalid_track_license' using errcode='22023'; end if;
  if coalesce(trim(target_attribution_text),'')='' then raise exception 'invalid_track_attribution' using errcode='22023'; end if;
  select * into room from public.party_rooms r where r.public_id=target_room_public_id and r.status='active' and r.room_type='radio';
  if room.id is null then raise exception 'radio_room_not_found' using errcode='22023'; end if;
  insert into public.radio_tracks(room_id,uploader_user_id,title,artist_name,storage_key,artwork_key,duration_seconds,rights_attested,license,attribution_text)
  values(room.id,null,trim(target_title),nullif(trim(coalesce(target_artist_name,'')),''),target_storage_key,target_artwork_key,target_duration_seconds,true,trim(target_license),trim(target_attribution_text))
  returning * into new_track;
  id:=new_track.id;
  return next;
end;
$$;
revoke all on function public.admin_submit_radio_track(uuid,text,text,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.admin_submit_radio_track(uuid,text,text,text,text,integer,text,text) to service_role;

drop function if exists public.next_radio_track(uuid);
create or replace function public.next_radio_track(target_room_public_id uuid)
returns table(id uuid,title text,artist_name text,storage_key text,artwork_key text,duration_seconds integer,curated_only boolean,listener_message text,license text,attribution_text text)
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
  id:=picked.id;title:=picked.title;artist_name:=picked.artist_name;storage_key:=picked.storage_key;artwork_key:=picked.artwork_key;duration_seconds:=picked.duration_seconds;curated_only:=room.curated_only;listener_message:=picked.listener_message;license:=picked.license;attribution_text:=picked.attribution_text;
  return next;
end;
$$;
revoke all on function public.next_radio_track(uuid) from public,anon,authenticated;
grant execute on function public.next_radio_track(uuid) to service_role;

drop function if exists public.list_radio_queue(uuid);
create or replace function public.list_radio_queue(target_room_public_id uuid)
returns table(id uuid,title text,artist_name text,artwork_key text,duration_seconds integer,status text,listener_message text,license text,attribution_text text)
language sql security definer set search_path='' stable as $$
  select t.id,t.title,t.artist_name,t.artwork_key,t.duration_seconds,t.status,t.listener_message,t.license,t.attribution_text
  from public.radio_tracks t join public.party_rooms r on r.id=t.room_id
  where r.public_id=target_room_public_id and t.status in ('queued','playing')
  order by (t.status='playing') desc, t.sort_key asc limit 50;
$$;
revoke all on function public.list_radio_queue(uuid) from public,anon;
grant execute on function public.list_radio_queue(uuid) to authenticated;
