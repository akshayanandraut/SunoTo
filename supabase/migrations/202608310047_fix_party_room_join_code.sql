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
  make_public boolean;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if desired_room_type not in ('audio','audio_video','music','radio') then raise exception 'invalid_room_type' using errcode='22023'; end if;
  if desired_price_tier not in ('standard','basic') then raise exception 'invalid_price_tier' using errcode='22023'; end if;
  if coalesce(trim(desired_name),'')='' then raise exception 'invalid_room_name' using errcode='22023'; end if;

  tier_cost_per_month:=case desired_price_tier when 'standard' then 10000 else 5000 end;
  discount:=0.85;
  total_cost:=case when months=1 then tier_cost_per_month else round(tier_cost_per_month*months*discount) end;
  make_public:=(desired_room_type='radio');

  idem_key:='party-room-create:'||uid::text||':'||activation_time::text;
  new_join_code:=replace(gen_random_uuid()::text,'-','');

  select * into wallet_result from public.apply_wallet_entry(uid,-total_cost,'party_room_activation','Party room activation ('||months||' month(s))',idem_key,jsonb_build_object('room_type',desired_room_type,'price_tier',desired_price_tier,'months',months));

  insert into public.party_rooms(room_type,price_tier,owner_user_id,host_user_id,host_claimed_at,host_last_active_at,name,status,starts_at,ends_at,join_code,is_public)
  values(desired_room_type,desired_price_tier,uid,uid,activation_time,activation_time,trim(desired_name),'active',activation_time,activation_time+make_interval(months=>months),new_join_code,make_public)
  returning * into new_room;

  public_id:=new_room.public_id;join_code:=new_room.join_code;ends_at:=new_room.ends_at;balance:=wallet_result.balance;idempotent:=wallet_result.idempotent;
  return next;
end;
$$;
revoke all on function public.create_party_room(text,text,text,int,timestamptz) from public,anon;
grant execute on function public.create_party_room(text,text,text,int,timestamptz) to authenticated;
