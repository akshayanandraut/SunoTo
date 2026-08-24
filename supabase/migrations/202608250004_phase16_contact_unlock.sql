create or replace function public.activate_contact_unlock(target_session_id text,left_user_id uuid,right_user_id uuid)
returns table(left_balance bigint,right_balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare left_result record;right_result record;
begin
  if length(target_session_id)<8 or left_user_id is null or right_user_id is null or left_user_id=right_user_id then raise exception 'invalid_contact_unlock' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(least(left_user_id::text,right_user_id::text),0));perform pg_advisory_xact_lock(hashtextextended(greatest(left_user_id::text,right_user_id::text),0));
  select * into left_result from public.apply_wallet_entry(left_user_id,-500,'contact_unlock','Mutual contact sharing','contact-unlock:'||target_session_id||':'||left_user_id::text,jsonb_build_object('session_id',target_session_id));
  select * into right_result from public.apply_wallet_entry(right_user_id,-500,'contact_unlock','Mutual contact sharing','contact-unlock:'||target_session_id||':'||right_user_id::text,jsonb_build_object('session_id',target_session_id));
  left_balance:=left_result.balance;right_balance:=right_result.balance;idempotent:=left_result.idempotent and right_result.idempotent;return next;
end;
$$;
revoke all on function public.activate_contact_unlock(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_contact_unlock(text,uuid,uuid) to service_role;
