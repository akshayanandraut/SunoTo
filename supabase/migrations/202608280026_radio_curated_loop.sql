alter table public.radio_tracks add column if not exists sort_key double precision not null default extract(epoch from clock_timestamp());

drop function if exists public.list_radio_queue(uuid);
create or replace function public.list_radio_queue(target_room_public_id uuid)
returns table(id uuid,title text,artist_name text,artwork_key text,duration_seconds integer,status text)
language sql security definer set search_path='' stable as $$
  select t.id,t.title,t.artist_name,t.artwork_key,t.duration_seconds,t.status
  from public.radio_tracks t join public.party_rooms r on r.id=t.room_id
  where r.public_id=target_room_public_id and t.status in ('queued','playing')
  order by (t.status='playing') desc, t.sort_key asc limit 50;
$$;
revoke all on function public.list_radio_queue(uuid) from public,anon;
grant execute on function public.list_radio_queue(uuid) to authenticated;

drop function if exists public.next_radio_track(uuid);
create or replace function public.next_radio_track(target_room_public_id uuid)
returns table(id uuid,title text,artist_name text,storage_key text,artwork_key text,duration_seconds integer,curated_only boolean)
language plpgsql security definer set search_path='' as $$
declare
  room public.party_rooms%rowtype;
  picked public.radio_tracks%rowtype;
begin
  select * into room from public.party_rooms r where r.public_id=target_room_public_id and r.room_type='radio';
  if room.id is null then return; end if;

  update public.radio_tracks set status='removed' where room_id=room.id and status='playing';

  select * into picked from public.radio_tracks t where t.room_id=room.id and t.status='queued' order by t.sort_key asc limit 1 for update skip locked;

  if picked.id is null and room.curated_only then
    update public.radio_tracks set status='queued',sort_key=random() where room_id=room.id and status in ('played','removed');
    select * into picked from public.radio_tracks t where t.room_id=room.id and t.status='queued' order by t.sort_key asc limit 1 for update skip locked;
  end if;

  if picked.id is null then return; end if;

  update public.radio_tracks set status='playing' where radio_tracks.id=picked.id;
  id:=picked.id;title:=picked.title;artist_name:=picked.artist_name;storage_key:=picked.storage_key;artwork_key:=picked.artwork_key;duration_seconds:=picked.duration_seconds;curated_only:=room.curated_only;
  return next;
end;
$$;
revoke all on function public.next_radio_track(uuid) from public,anon,authenticated;
grant execute on function public.next_radio_track(uuid) to service_role;
