create or replace function public.join_party_room_by_code(desired_join_code text,activation_time timestamptz default now())
returns table(public_id uuid,room_type text,name text)
language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  room public.party_rooms%rowtype;
  member_count integer;
  already_member boolean;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  select * into room from public.party_rooms r where r.join_code=desired_join_code and r.status='active' for update;
  if room.id is null then raise exception 'room_not_found' using errcode='22023'; end if;
  if room.ends_at<=activation_time then raise exception 'room_expired' using errcode='22023'; end if;
  select exists(select 1 from public.party_room_members m where m.room_id=room.id and m.user_id=uid and m.left_at is null) into already_member;
  if not already_member then
    select count(*) into member_count from public.party_room_members m where m.room_id=room.id and m.left_at is null;
    if member_count>=10 then raise exception 'room_full' using errcode='22023'; end if;
  end if;
  insert into public.party_room_members(room_id,user_id) values(room.id,uid)
  on conflict(room_id,user_id) do update set left_at=null;
  public_id:=room.public_id;room_type:=room.room_type;name:=room.name;
  return next;
end;
$$;
revoke all on function public.join_party_room_by_code(text,timestamptz) from public,anon;
grant execute on function public.join_party_room_by_code(text,timestamptz) to authenticated;
