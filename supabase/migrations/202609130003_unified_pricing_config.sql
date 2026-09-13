-- Unified pricing config: one admin-editable app_config key covering every price that was
-- previously hardcoded with NO admin control at all (a code deploy was the only way to change
-- them). Values below are a one-time "pull" of what's live today -- nothing changes for users on
-- this migration, it just becomes editable going forward. Membership/store/ads/virtual/guestWin/
-- adEarning/dailyStreak pricing already had their own admin-editable app_config entries before
-- this and are intentionally left as-is (not duplicated here) -- this key covers the gaps.
--
-- Also fixes a real bug found while building this: party room pricing existed in TWO places that
-- could silently drift apart -- worker/src/policies/partyRoomPolicy.js's ROOM_PRICE_TIERS (used
-- only for client display) and a separately hardcoded `case ... 10000 ... 5000` inside the
-- create_party_room SQL function (the one that actually charges). This migration makes the SQL
-- function read from this new shared config instead of its own hardcoded copy.
insert into public.app_config(key,value,version) values (
  'pricing',
  '{
    "roomPriceTiersCreditsPerMonth": {"standard": 10000, "basic": 5000},
    "roomMultiMonthDiscountMultiplier": 0.85,
    "verificationFeeCredits": 100,
    "favouriteReconnectCredits": 50,
    "paidMessageCredits": 10,
    "paidPhotoCredits": 25,
    "contactUnlockCredits": 500,
    "contactUnlockSeconds": 300,
    "preferenceFees": {"genderCredits": 50, "genderAgeCredits": 75, "genderAgeRadiusCredits": 100, "languageAddonCredits": 25, "interestAddonCredits": 25}
  }'::jsonb,
  1
) on conflict (key) do nothing;

create or replace function public.update_pricing_config(admin_id uuid,expected_version bigint,new_value jsonb)
returns table(value jsonb,version bigint,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare current_row public.app_config%rowtype;before_value jsonb;
begin
  select * into current_row from public.app_config where key='pricing' for update;
  if current_row.key is null then raise exception 'pricing_config_not_found' using errcode='22023'; end if;
  if current_row.version<>expected_version then raise exception 'config_version_conflict' using errcode='40001'; end if;
  before_value:=current_row.value;
  update public.app_config set value=new_value,version=version+1,updated_at=now() where key='pricing' returning app_config.value,app_config.version,app_config.updated_at into value,version,updated_at;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'pricing.update','app_config','pricing',before_value,new_value);
  return next;
end;
$$;
revoke all on function public.update_pricing_config(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.update_pricing_config(uuid,bigint,jsonb) to service_role;

-- create_party_room, unchanged except tier_cost_per_month/discount now come from the shared
-- pricing config instead of their own hardcoded copies (with the exact same hardcoded values as
-- fallback, so behavior is identical unless/until an admin actually edits the pricing config).
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
  pricing jsonb;
begin
  if uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if desired_room_type not in ('audio','audio_video','music','radio') then raise exception 'invalid_room_type' using errcode='22023'; end if;
  if desired_price_tier not in ('standard','basic') then raise exception 'invalid_price_tier' using errcode='22023'; end if;
  if coalesce(trim(desired_name),'')='' then raise exception 'invalid_room_name' using errcode='22023'; end if;

  select value into pricing from public.app_config where key='pricing';
  tier_cost_per_month:=coalesce((pricing->'roomPriceTiersCreditsPerMonth'->>desired_price_tier)::bigint,case desired_price_tier when 'standard' then 10000 else 5000 end);
  discount:=coalesce((pricing->>'roomMultiMonthDiscountMultiplier')::numeric,0.85);
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

-- request_verification, unchanged except the verification fee now comes from the shared pricing
-- config (with the same 100-credit fallback), same reasoning as create_party_room above.
create or replace function public.request_verification(target_user_id uuid)
returns table(verified_at timestamptz,balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare active_days integer;wallet_result record;already timestamptz;fee bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text,1));
  select p.verified_at into already from public.profiles p where p.user_id=target_user_id;
  if already is not null then verified_at:=already;select w.balance into balance from public.wallets w where w.user_id=target_user_id;idempotent:=true;return next;return;end if;
  select count(distinct access_day) into active_days from public.daily_entitlements where user_id=target_user_id and access_day>=(current_date-30);
  if coalesce(active_days,0)<15 then raise exception 'verification_requires_consistent_activity' using errcode='22023';end if;
  select coalesce((value->>'verificationFeeCredits')::bigint,100) into fee from public.app_config where key='pricing';
  select * into wallet_result from public.apply_wallet_entry(target_user_id,-fee,'verification','Profile verification',('verification:'||target_user_id::text),jsonb_build_object('active_days',active_days));
  update public.profiles set verified_at=now() where user_id=target_user_id returning profiles.verified_at into verified_at;
  balance:=wallet_result.balance;idempotent:=false;return next;
end;
$$;
revoke all on function public.request_verification(uuid) from public,anon,authenticated;
grant execute on function public.request_verification(uuid) to service_role;
