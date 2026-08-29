create table if not exists public.radio_tracks(
  id uuid primary key default gen_random_uuid(),
  room_id bigint not null references public.party_rooms(id) on delete cascade,
  uploader_user_id uuid not null references auth.users(id),
  title text not null,
  artist_name text,
  storage_key text not null,
  artwork_key text,
  duration_seconds integer not null check (duration_seconds between 30 and 900),
  status text not null default 'queued' check (status in ('queued','playing','played','removed')),
  rights_attested boolean not null default false,
  created_at timestamptz not null default now(),
  played_at timestamptz
);

create index if not exists radio_tracks_room_queue_idx on public.radio_tracks(room_id,status,created_at);

alter table public.radio_tracks enable row level security;

create policy "uploaders see their own radio tracks" on public.radio_tracks for select to authenticated using (uploader_user_id=auth.uid());

create policy "public radio queue is visible to authenticated users" on public.radio_tracks for select to authenticated using (
  status in ('queued','playing') and exists(select 1 from public.party_rooms r where r.id=room_id and r.is_public and r.room_type='radio' and r.status='active')
);

create or replace function public.submit_radio_track(target_room_public_id uuid,target_title text,target_artist_name text,target_storage_key text,target_artwork_key text,target_duration_seconds integer,target_rights_attested boolean)
returns table(id uuid,queue_position bigint)
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  room public.party_rooms%rowtype;
  new_track public.radio_tracks%rowtype;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if not target_rights_attested then raise exception 'rights_attestation_required' using errcode='22023'; end if;
  if coalesce(trim(target_title),'')='' then raise exception 'invalid_track_title' using errcode='22023'; end if;
  if target_duration_seconds<30 or target_duration_seconds>900 then raise exception 'invalid_track_duration' using errcode='22023'; end if;

  select * into room from public.party_rooms r where r.public_id=target_room_public_id and r.status='active' and r.room_type='radio';
  if room.id is null then raise exception 'radio_room_not_found' using errcode='22023'; end if;

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

create or replace function public.list_radio_queue(target_room_public_id uuid)
returns table(id uuid,title text,artist_name text,artwork_key text,duration_seconds integer,status text)
language sql security definer set search_path='' stable as $$
  select t.id,t.title,t.artist_name,t.artwork_key,t.duration_seconds,t.status
  from public.radio_tracks t join public.party_rooms r on r.id=t.room_id
  where r.public_id=target_room_public_id and t.status in ('queued','playing')
  order by (t.status='playing') desc, t.created_at asc limit 50;
$$;
revoke all on function public.list_radio_queue(uuid) from public,anon;
grant execute on function public.list_radio_queue(uuid) to authenticated;

create or replace function public.next_radio_track(target_room_public_id uuid)
returns table(id uuid,title text,artist_name text,storage_key text,artwork_key text,duration_seconds integer)
language plpgsql security definer set search_path='' as $$
declare
  room public.party_rooms%rowtype;
  picked public.radio_tracks%rowtype;
begin
  select * into room from public.party_rooms r where r.public_id=target_room_public_id and r.room_type='radio';
  if room.id is null then return; end if;

  update public.radio_tracks set status='removed' where room_id=room.id and status='playing';

  select * into picked from public.radio_tracks t where t.room_id=room.id and t.status='queued' order by t.created_at asc limit 1 for update skip locked;
  if picked.id is null then return; end if;

  update public.radio_tracks set status='playing' where radio_tracks.id=picked.id;
  id:=picked.id;title:=picked.title;artist_name:=picked.artist_name;storage_key:=picked.storage_key;artwork_key:=picked.artwork_key;duration_seconds:=picked.duration_seconds;
  return next;
end;
$$;
revoke all on function public.next_radio_track(uuid) from public,anon,authenticated;
grant execute on function public.next_radio_track(uuid) to service_role;

create or replace function public.complete_radio_track(target_track_id uuid)
returns void
language sql security definer set search_path='' as $$
  update public.radio_tracks set status='played',played_at=now() where id=target_track_id and status='playing';
$$;
revoke all on function public.complete_radio_track(uuid) from public,anon,authenticated;
grant execute on function public.complete_radio_track(uuid) to service_role;
