create table if not exists public.party_rooms (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  room_type text not null check (room_type in ('audio','audio_video','music')),
  price_tier text not null check (price_tier in ('standard','basic')),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  host_user_id uuid references auth.users(id) on delete set null,
  host_claimed_at timestamptz,
  host_last_active_at timestamptz,
  name text not null,
  status text not null default 'active' check (status in ('active','archived')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  join_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists party_rooms_owner_idx on public.party_rooms(owner_user_id);
create index if not exists party_rooms_status_idx on public.party_rooms(status,ends_at);
alter table public.party_rooms enable row level security;
revoke all on public.party_rooms from anon,authenticated;
grant select on public.party_rooms to authenticated;

create table if not exists public.party_room_members (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.party_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique(room_id,user_id)
);
create index if not exists party_room_members_room_idx on public.party_room_members(room_id);
alter table public.party_room_members enable row level security;
revoke all on public.party_room_members from anon,authenticated;
grant select on public.party_room_members to authenticated;
create policy "members read own membership rows" on public.party_room_members for select to authenticated using (
  (select auth.uid())=user_id
  or exists(select 1 from public.party_rooms r where r.id=party_room_members.room_id and (r.owner_user_id=(select auth.uid()) or r.host_user_id=(select auth.uid())))
);

create policy "members read their rooms" on public.party_rooms for select to authenticated using (
  (select auth.uid())=owner_user_id
  or (select auth.uid())=host_user_id
  or exists(select 1 from public.party_room_members m where m.room_id=party_rooms.id and m.user_id=(select auth.uid()))
);

create table if not exists public.party_room_invites (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.party_rooms(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid references auth.users(id) on delete cascade,
  invitee_username text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists party_room_invites_room_idx on public.party_room_invites(room_id);
alter table public.party_room_invites enable row level security;
revoke all on public.party_room_invites from anon,authenticated;
grant select on public.party_room_invites to authenticated;
create policy "invite parties read their invites" on public.party_room_invites for select to authenticated using (
  (select auth.uid())=inviter_user_id or (select auth.uid())=invitee_user_id
);

create or replace function public.create_party_room(desired_room_type text,desired_price_tier text,desired_name text,desired_months int default 1,activation_time timestamptz default now())
returns table(public_id uuid,join_code text,ends_at timestamptz,balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  months int := greatest(1,coalesce(desired_months,1));
  tier_cost_per_month bigint;
  discount numeric;
  total_cost bigint;
  new_join_code text;
  new_room public.party_rooms%rowtype;
  wallet_result record;
  idem_key text;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if desired_room_type not in ('audio','audio_video','music') then raise exception 'invalid_room_type' using errcode='22023'; end if;
  if desired_price_tier not in ('standard','basic') then raise exception 'invalid_price_tier' using errcode='22023'; end if;
  if coalesce(trim(desired_name),'')='' then raise exception 'invalid_room_name' using errcode='22023'; end if;

  tier_cost_per_month:=case desired_price_tier when 'standard' then 10000 else 5000 end;
  discount:=0.85;
  total_cost:=case when months=1 then tier_cost_per_month else round(tier_cost_per_month*months*discount) end;

  idem_key:='party-room-create:'||uid::text||':'||activation_time::text;
  new_join_code:=encode(gen_random_bytes(6),'hex');

  select * into wallet_result from public.apply_wallet_entry(uid,-total_cost,'party_room_activation','Party room activation ('||months||' month(s))',idem_key,jsonb_build_object('room_type',desired_room_type,'price_tier',desired_price_tier,'months',months));

  insert into public.party_rooms(room_type,price_tier,owner_user_id,host_user_id,host_claimed_at,host_last_active_at,name,status,starts_at,ends_at,join_code)
  values(desired_room_type,desired_price_tier,uid,uid,activation_time,activation_time,trim(desired_name),'active',activation_time,activation_time+make_interval(months=>months),new_join_code)
  returning * into new_room;

  public_id:=new_room.public_id;join_code:=new_room.join_code;ends_at:=new_room.ends_at;balance:=wallet_result.balance;idempotent:=wallet_result.idempotent;
  return next;
end;
$$;
revoke all on function public.create_party_room(text,text,text,int,timestamptz) from public,anon;
grant execute on function public.create_party_room(text,text,text,int,timestamptz) to authenticated;

create or replace function public.claim_party_room_host(target_public_id uuid,inactivity_timeout_seconds int default 600,activation_time timestamptz default now())
returns table(host_user_id uuid,host_claimed_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  room public.party_rooms%rowtype;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  select * into room from public.party_rooms r where r.public_id=target_public_id and r.status='active' for update;
  if room.id is null then raise exception 'room_not_found' using errcode='22023'; end if;
  if room.ends_at<=activation_time then raise exception 'room_expired' using errcode='22023'; end if;
  if room.host_user_id is not null and room.host_user_id<>uid and room.host_last_active_at is not null and room.host_last_active_at>activation_time-make_interval(secs=>inactivity_timeout_seconds) then
    raise exception 'host_slot_active' using errcode='42501';
  end if;
  update public.party_rooms p set host_user_id=uid,host_claimed_at=activation_time,host_last_active_at=activation_time,updated_at=activation_time where p.id=room.id
  returning p.host_user_id,p.host_claimed_at into host_user_id,host_claimed_at;
  return next;
end;
$$;
revoke all on function public.claim_party_room_host(uuid,int,timestamptz) from public,anon;
grant execute on function public.claim_party_room_host(uuid,int,timestamptz) to authenticated;
