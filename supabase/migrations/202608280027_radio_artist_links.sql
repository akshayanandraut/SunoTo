alter table public.party_rooms add column if not exists artist_spotify_url text;
alter table public.party_rooms add column if not exists artist_apple_music_url text;

create or replace function public.admin_set_radio_artist_links(admin_id uuid,target_room_public_id uuid,spotify_url text,apple_music_url text)
returns void
language plpgsql security definer set search_path='' as $$
begin
  if spotify_url is not null and spotify_url!='' and spotify_url !~ '^https://(open\.spotify\.com)/' then raise exception 'invalid_spotify_url' using errcode='22023'; end if;
  if apple_music_url is not null and apple_music_url!='' and apple_music_url !~ '^https://(music\.apple\.com)/' then raise exception 'invalid_apple_music_url' using errcode='22023'; end if;
  update public.party_rooms set artist_spotify_url=nullif(trim(coalesce(spotify_url,'')),''),artist_apple_music_url=nullif(trim(coalesce(apple_music_url,'')),'')
  where public_id=target_room_public_id and room_type='radio';
  if not found then raise exception 'radio_room_not_found' using errcode='22023'; end if;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value)
  values(admin_id,'radio_artist_links_updated','party_room',target_room_public_id::text,null,jsonb_build_object('spotify_url',spotify_url,'apple_music_url',apple_music_url));
end;
$$;
revoke all on function public.admin_set_radio_artist_links(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_set_radio_artist_links(uuid,uuid,text,text) to service_role;

drop function if exists public.list_radio_channels();
create or replace function public.list_radio_channels()
returns table(public_id uuid,name text,room_type text,curated_only boolean,artist_spotify_url text,artist_apple_music_url text)
language sql security definer set search_path='' stable as $$
  select public_id,name,room_type,curated_only,artist_spotify_url,artist_apple_music_url from public.party_rooms
  where is_global and status='active' and room_type='radio'
  order by curated_only desc;
$$;
revoke all on function public.list_radio_channels() from public,anon;
grant execute on function public.list_radio_channels() to authenticated;

drop function if exists public.list_public_radio_rooms();

create or replace function public.list_public_radio_rooms()
returns table(public_id uuid,name text,join_code text,room_type text,now_playing_title text,now_playing_artist text,artist_spotify_url text,artist_apple_music_url text)
language sql security definer set search_path='' stable as $$
  select r.public_id,r.name,r.join_code,r.room_type,t.title,t.artist_name,r.artist_spotify_url,r.artist_apple_music_url
  from public.party_rooms r
  left join lateral (
    select title,artist_name from public.radio_tracks rt where rt.room_id=r.id and rt.status='playing' limit 1
  ) t on true
  where r.is_public and r.status='active' and r.room_type='radio'
  order by r.is_global desc,r.curated_only desc,r.created_at desc limit 50;
$$;
revoke all on function public.list_public_radio_rooms() from public,anon;
grant execute on function public.list_public_radio_rooms() to authenticated;
