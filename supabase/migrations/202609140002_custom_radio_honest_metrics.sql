-- Decision F (OPUS_DECISIONS.md): re-enabling custom (user-hosted) radio channels without any
-- simulated-listener or bot-chat layer. Instead of a fabricated concurrent count, the directory
-- shows only true, verifiable signals: total completed plays, plays today, and what's queued next.
-- Restricted to genuinely user-created channels (excludes the official global channels, already
-- shown elsewhere via list_radio_channels, and admin-curated channels, which aren't "hosted" by a
-- regular user in the sense this directory is for).
drop function if exists public.list_public_radio_rooms();
create or replace function public.list_public_radio_rooms()
returns table(public_id uuid,name text,join_code text,room_type text,now_playing_title text,now_playing_artist text,total_listens bigint,listens_today bigint,up_next_title text)
language sql security definer set search_path='' stable as $$
  select r.public_id,r.name,r.join_code,r.room_type,t.title,t.artist_name,
    coalesce(stats.total_listens,0),coalesce(stats.listens_today,0),nxt.title
  from public.party_rooms r
  left join lateral (
    select title,artist_name from public.radio_tracks rt where rt.room_id=r.id and rt.status='playing' limit 1
  ) t on true
  left join lateral (
    select count(*) as total_listens, count(*) filter (where played_at>=current_date) as listens_today
    from public.radio_tracks rt2 where rt2.room_id=r.id and rt2.status='played'
  ) stats on true
  left join lateral (
    select title from public.radio_tracks rt3 where rt3.room_id=r.id and rt3.status='queued' order by rt3.sort_key asc limit 1
  ) nxt on true
  where r.is_public and r.status='active' and r.room_type='radio' and not r.is_global and not r.curated_only
  order by coalesce(stats.total_listens,0) desc,r.created_at desc limit 50;
$$;
revoke all on function public.list_public_radio_rooms() from public,anon;
grant execute on function public.list_public_radio_rooms() to authenticated;
