create or replace function public.join_party_room_by_code(desired_join_code text,activation_time timestamptz default now())
returns table(public_id uuid,room_type text,name text)
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  room public.party_rooms%rowtype;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  select * into room from public.party_rooms r where r.join_code=desired_join_code and r.status='active' for update;
  if room.id is null then raise exception 'room_not_found' using errcode='22023'; end if;
  if room.ends_at<=activation_time then raise exception 'room_expired' using errcode='22023'; end if;
  insert into public.party_room_members(room_id,user_id) values(room.id,uid)
  on conflict(room_id,user_id) do update set left_at=null;
  public_id:=room.public_id;room_type:=room.room_type;name:=room.name;
  return next;
end;
$$;
revoke all on function public.join_party_room_by_code(text,timestamptz) from public,anon;
grant execute on function public.join_party_room_by_code(text,timestamptz) to authenticated;

create or replace function public.invite_to_party_room(target_public_id uuid,invitee_user_id uuid default null,invitee_username text default null)
returns table(id bigint)
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  room public.party_rooms%rowtype;
  resolved_invitee uuid;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if invitee_user_id is null and coalesce(trim(invitee_username),'')='' then raise exception 'invitee_required' using errcode='22023'; end if;
  select * into room from public.party_rooms r where r.public_id=target_public_id and r.status='active';
  if room.id is null then raise exception 'room_not_found' using errcode='22023'; end if;
  if room.owner_user_id<>uid and room.host_user_id<>uid then raise exception 'not_authorized' using errcode='42501'; end if;
  resolved_invitee:=invitee_user_id;
  if resolved_invitee is null then
    select user_id into resolved_invitee from public.profiles where lower(username)=lower(trim(invitee_username)) limit 1;
    if resolved_invitee is null then raise exception 'username_not_found' using errcode='22023'; end if;
  end if;
  insert into public.party_room_invites(room_id,inviter_user_id,invitee_user_id,invitee_username) values(room.id,uid,resolved_invitee,invitee_username)
  returning party_room_invites.id into id;
  return next;
end;
$$;
revoke all on function public.invite_to_party_room(uuid,uuid,text) from public,anon;
grant execute on function public.invite_to_party_room(uuid,uuid,text) to authenticated;
