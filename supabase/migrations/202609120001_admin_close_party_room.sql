-- T-052: give admins a party-room-specific "close room" action. Previously an admin could only
-- restrict the underlying *account* via the existing restriction tools, not act on the *room*
-- itself. Adds a distinct 'closed' status (separate from the already-defined-but-unused
-- 'archived', which reads as passive/historical rather than an explicit moderation action) so the
-- audit trail and any future room-list filtering can tell the two apart.
alter table public.party_rooms drop constraint if exists party_rooms_status_check;
alter table public.party_rooms add constraint party_rooms_status_check check (status in ('active','archived','closed'));

create or replace function public.admin_close_party_room(admin_id uuid,room_public_id uuid,close_reason text)
returns public.party_rooms
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb;
  after_row public.party_rooms%rowtype;
begin
  if length(trim(close_reason)) < 4 then raise exception 'invalid_close_reason' using errcode='22023'; end if;
  select to_jsonb(r) into before_row from public.party_rooms r where r.public_id = room_public_id for update;
  if before_row is null then raise exception 'room_not_found' using errcode='22023'; end if;
  update public.party_rooms set status='closed',updated_at=now() where public_id=room_public_id returning * into after_row;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'party_room.close','party_room',room_public_id::text,before_row,to_jsonb(after_row));
  return after_row;
end;
$$;
revoke all on function public.admin_close_party_room(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_close_party_room(uuid,uuid,text) to service_role;
