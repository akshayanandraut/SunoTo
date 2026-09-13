-- Fix "structure of query does not match function result type" in nearby_live_world_placements:
-- profiles.username is citext, but the function declared its return column as plain text. Cast it.
create or replace function public.nearby_live_world_placements(target_user_id uuid)
returns table(user_public_id uuid,grid_lat numeric,grid_lng numeric,username text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    select p.public_id,lwp.grid_lat,lwp.grid_lng,p.username::text
    from public.live_world_placements lwp
    join public.profiles p on p.user_id=lwp.user_id
    where lwp.user_id<>target_user_id
      and p.public_id::text not in (select b.blocked_ref from public.blocks b where b.blocker_user_id=target_user_id)
      and not exists(select 1 from public.blocks b2 where b2.blocker_user_id=lwp.user_id and b2.blocked_ref=(select public_id::text from public.profiles where user_id=target_user_id))
    order by lwp.updated_at desc
    limit 200;
end;
$$;
revoke all on function public.nearby_live_world_placements(uuid) from public,anon,authenticated;
grant execute on function public.nearby_live_world_placements(uuid) to service_role;
