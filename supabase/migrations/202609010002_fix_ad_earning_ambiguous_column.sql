-- Fix "column reference credits_awarded is ambiguous" in claim_ad_reward: the daily-cap sum
-- collided with the function's own credits_awarded OUT parameter. Qualify with a table alias.
create or replace function public.claim_ad_reward(target_user_id uuid,target_request_id text)
returns table(balance bigint,credits_awarded int,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare cfg jsonb;existing public.ad_reward_claims%rowtype;eligible boolean;last_claim_at timestamptz;recent_total bigint;credits_per_view int;wallet_result record;new_claim_id uuid;
begin
  if coalesce(trim(target_request_id),'')='' then raise exception 'invalid_request_id' using errcode='22023'; end if;

  select * into existing from public.ad_reward_claims where user_id=target_user_id and request_id=target_request_id;
  if existing.id is not null then
    select * into wallet_result from public.apply_wallet_entry(target_user_id,existing.credits_awarded::bigint,'ad_reward_claim','Rewarded ad view','adreward:'||existing.id,'{}'::jsonb);
    balance:=wallet_result.balance;credits_awarded:=existing.credits_awarded;idempotent:=true;
    return next;
    return;
  end if;

  select value into cfg from public.app_config where key='ad_earning';
  if cfg is null or coalesce((cfg->>'enabled')::boolean,false)=false then raise exception 'ad_earning_disabled' using errcode='42501'; end if;

  select coalesce((select p.is_premium from public.profiles p where p.user_id=target_user_id),false)
    or public.streaming_membership_status(target_user_id) into eligible;
  if not eligible then raise exception 'ad_earning_not_eligible' using errcode='42501'; end if;

  credits_per_view:=coalesce((cfg->>'creditsPerView')::int,500);

  select max(created_at) into last_claim_at from public.ad_reward_claims where user_id=target_user_id;
  if last_claim_at is not null and last_claim_at>now()-make_interval(secs=>coalesce((cfg->>'cooldownSeconds')::int,60)) then
    raise exception 'ad_reward_cooldown' using errcode='42901';
  end if;

  select coalesce(sum(arc.credits_awarded),0) into recent_total from public.ad_reward_claims arc where arc.user_id=target_user_id and arc.created_at>now()-interval '24 hours';
  if recent_total+credits_per_view>coalesce((cfg->>'dailyCapCredits')::int,2000) then
    raise exception 'ad_reward_daily_cap_reached' using errcode='42901';
  end if;

  insert into public.ad_reward_claims(user_id,request_id,credits_awarded) values(target_user_id,target_request_id,credits_per_view) returning id into new_claim_id;
  select * into wallet_result from public.apply_wallet_entry(target_user_id,credits_per_view::bigint,'ad_reward_claim','Rewarded ad view','adreward:'||new_claim_id,'{}'::jsonb);
  balance:=wallet_result.balance;credits_awarded:=credits_per_view;idempotent:=false;
  return next;
end;
$$;
revoke all on function public.claim_ad_reward(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_ad_reward(uuid,text) to service_role;
