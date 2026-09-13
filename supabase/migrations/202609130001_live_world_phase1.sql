-- Live World, phase 1 (T-090): premium-only, text-chat-only foundation. Deliberately excludes real-time
-- voice broadcast and 3D rendering, which need their own dedicated safety/consent design pass before
-- being built (see TASKS.md T-090 for the full requirement list and why voice is deferred).
--
-- Privacy: location is snapped to a coarse 0.5-degree grid cell (~55km) before it is ever stored —
-- the exact coordinate the browser reports is never persisted or returned to any other user.
-- Opt-in is a dedicated action distinct from account signup, and is fully revocable at any time.

alter table public.profiles add column if not exists live_world_opted_in_at timestamptz;

create table if not exists public.live_world_placements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  grid_lat numeric not null check (grid_lat >= -90 and grid_lat <= 90),
  grid_lng numeric not null check (grid_lng >= -180 and grid_lng <= 180),
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.live_world_placements enable row level security;
revoke all on public.live_world_placements from anon, authenticated;

create table if not exists public.live_world_chat_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  session_id uuid,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default now() + interval '10 minutes',
  check (from_user_id <> to_user_id)
);
create index if not exists live_world_chat_requests_to_idx on public.live_world_chat_requests(to_user_id, status);
create index if not exists live_world_chat_requests_from_idx on public.live_world_chat_requests(from_user_id, status);
alter table public.live_world_chat_requests enable row level security;
revoke all on public.live_world_chat_requests from anon, authenticated;

create or replace function public.opt_in_live_world(target_user_id uuid)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare is_premium_account boolean;result timestamptz;
begin
  select is_premium into is_premium_account from public.profiles where user_id=target_user_id;
  if not coalesce(is_premium_account,false) then raise exception 'live_world_requires_premium' using errcode='42501'; end if;
  update public.profiles set live_world_opted_in_at=now() where user_id=target_user_id returning live_world_opted_in_at into result;
  return result;
end;
$$;
revoke all on function public.opt_in_live_world(uuid) from public,anon,authenticated;
grant execute on function public.opt_in_live_world(uuid) to service_role;

create or replace function public.opt_out_live_world(target_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set live_world_opted_in_at=null where user_id=target_user_id;
  delete from public.live_world_placements where user_id=target_user_id;
end;
$$;
revoke all on function public.opt_out_live_world(uuid) from public,anon,authenticated;
grant execute on function public.opt_out_live_world(uuid) to service_role;

create or replace function public.place_live_world_character(target_user_id uuid,raw_lat numeric,raw_lng numeric)
returns public.live_world_placements
language plpgsql security definer set search_path = '' as $$
declare opted_in timestamptz;is_premium_account boolean;result public.live_world_placements%rowtype;
begin
  if raw_lat is null or raw_lng is null or raw_lat<-90 or raw_lat>90 or raw_lng<-180 or raw_lng>180 then raise exception 'invalid_coordinates' using errcode='22023'; end if;
  select live_world_opted_in_at,is_premium into opted_in,is_premium_account from public.profiles where user_id=target_user_id;
  if opted_in is null then raise exception 'live_world_opt_in_required' using errcode='42501'; end if;
  if not coalesce(is_premium_account,false) then raise exception 'live_world_requires_premium' using errcode='42501'; end if;
  insert into public.live_world_placements(user_id,grid_lat,grid_lng,placed_at,updated_at)
    values(target_user_id,round(raw_lat/0.5)*0.5,round(raw_lng/0.5)*0.5,now(),now())
    on conflict (user_id) do update set grid_lat=excluded.grid_lat,grid_lng=excluded.grid_lng,updated_at=now()
    returning * into result;
  return result;
end;
$$;
revoke all on function public.place_live_world_character(uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.place_live_world_character(uuid,numeric,numeric) to service_role;

create or replace function public.nearby_live_world_placements(target_user_id uuid)
returns table(user_public_id uuid,grid_lat numeric,grid_lng numeric,username text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    select p.public_id,lwp.grid_lat,lwp.grid_lng,p.username
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

create or replace function public.request_live_world_chat(target_from_user_id uuid,target_to_public_id uuid)
returns public.live_world_chat_requests
language plpgsql security definer set search_path = '' as $$
declare resolved_to_user_id uuid;existing public.live_world_chat_requests%rowtype;result public.live_world_chat_requests%rowtype;
begin
  select user_id into resolved_to_user_id from public.profiles where public_id=target_to_public_id;
  if resolved_to_user_id is null then raise exception 'live_world_target_not_found' using errcode='22023'; end if;
  if resolved_to_user_id=target_from_user_id then raise exception 'invalid_live_world_target' using errcode='22023'; end if;
  select * into existing from public.live_world_chat_requests
    where from_user_id=target_from_user_id and to_user_id=resolved_to_user_id and status='pending' and expires_at>now();
  if existing.id is not null then return existing; end if;
  insert into public.live_world_chat_requests(from_user_id,to_user_id) values(target_from_user_id,resolved_to_user_id) returning * into result;
  return result;
end;
$$;
revoke all on function public.request_live_world_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_live_world_chat(uuid,uuid) to service_role;

create or replace function public.respond_live_world_chat_request(target_user_id uuid,target_request_id uuid,accept boolean)
returns public.live_world_chat_requests
language plpgsql security definer set search_path = '' as $$
declare result public.live_world_chat_requests%rowtype;
begin
  select * into result from public.live_world_chat_requests where id=target_request_id and to_user_id=target_user_id for update;
  if result.id is null then raise exception 'live_world_request_not_found' using errcode='22023'; end if;
  if result.status<>'pending' or result.expires_at<=now() then raise exception 'live_world_request_not_pending' using errcode='22023'; end if;
  update public.live_world_chat_requests
    set status=case when accept then 'accepted' else 'declined' end,
        session_id=case when accept then gen_random_uuid() else null end,
        responded_at=now()
    where id=target_request_id
    returning * into result;
  return result;
end;
$$;
revoke all on function public.respond_live_world_chat_request(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.respond_live_world_chat_request(uuid,uuid,boolean) to service_role;

create or replace function public.admin_remove_live_world_placement(admin_id uuid,target_user_id uuid,removal_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare before_row jsonb;
begin
  if length(trim(removal_reason))<4 then raise exception 'invalid_removal_reason' using errcode='22023'; end if;
  select to_jsonb(l) into before_row from public.live_world_placements l where l.user_id=target_user_id;
  delete from public.live_world_placements where user_id=target_user_id;
  update public.profiles set live_world_opted_in_at=null where user_id=target_user_id;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'live_world.remove_placement','live_world_placement',target_user_id::text,before_row,null);
end;
$$;
revoke all on function public.admin_remove_live_world_placement(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_remove_live_world_placement(uuid,uuid,text) to service_role;
