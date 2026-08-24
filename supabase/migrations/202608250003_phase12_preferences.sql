create or replace function public.charge_preference_match(target_session_id text,left_user_id uuid,left_fee bigint,right_user_id uuid,right_fee bigint)
returns table(left_balance bigint,right_balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare left_result record;right_result record;
begin
  if length(target_session_id)<8 then raise exception 'invalid_session_id' using errcode='22023';end if;
  if left_fee not in (0,25,50,75,100,125,150) or right_fee not in (0,25,50,75,100,125,150) then raise exception 'invalid_preference_fee' using errcode='22023';end if;
  if left_fee>0 and left_user_id is null or right_fee>0 and right_user_id is null then raise exception 'account_required' using errcode='22023';end if;
  if left_user_id is not null and right_user_id is not null then perform pg_advisory_xact_lock(hashtextextended(least(left_user_id::text,right_user_id::text),0));perform pg_advisory_xact_lock(hashtextextended(greatest(left_user_id::text,right_user_id::text),0));end if;
  if left_fee>0 then select * into left_result from public.apply_wallet_entry(left_user_id,-left_fee,'preference_match','Matched paid preferences','preference:'||target_session_id||':'||left_user_id::text,jsonb_build_object('session_id',target_session_id));left_balance:=left_result.balance;end if;
  if right_fee>0 then select * into right_result from public.apply_wallet_entry(right_user_id,-right_fee,'preference_match','Matched paid preferences','preference:'||target_session_id||':'||right_user_id::text,jsonb_build_object('session_id',target_session_id));right_balance:=right_result.balance;end if;
  idempotent:=coalesce(left_result.idempotent,true) and coalesce(right_result.idempotent,true);return next;
end;
$$;
revoke all on function public.charge_preference_match(text,uuid,bigint,uuid,bigint) from public,anon,authenticated;
grant execute on function public.charge_preference_match(text,uuid,bigint,uuid,bigint) to service_role;
