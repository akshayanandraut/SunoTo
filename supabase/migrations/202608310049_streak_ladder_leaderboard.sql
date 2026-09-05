create or replace function public.climb_streak_ladder_round(target_user_id uuid,target_round_id bigint,target_idempotency_key text)
returns table(round_id bigint,current_rung smallint,survived boolean,busted boolean,maxed_out boolean,credits_balance bigint,payout_credits bigint)
language plpgsql security definer set search_path = '' as $$
declare
  round_row public.streak_ladder_rounds%rowtype;
  next_rung smallint;
  rung_row public.streak_ladder_rungs%rowtype;
  roll int;
  payout_result record;
  max_rung smallint;
begin
  select * into round_row from public.streak_ladder_rounds where id=target_round_id and user_id=target_user_id for update;
  if not found then raise exception 'round_not_found' using errcode='P0002'; end if;
  if round_row.status <> 'active' then raise exception 'round_not_active' using errcode='P0001'; end if;

  select max(rung) into max_rung from public.streak_ladder_rungs;
  next_rung:=round_row.current_rung+1;
  if next_rung > max_rung then raise exception 'already_maxed' using errcode='P0001'; end if;

  select * into rung_row from public.streak_ladder_rungs where rung=next_rung;
  roll:=floor(random()*10000)::int;
  payout_credits:=0;

  if roll < rung_row.survive_probability_bp then
    survived:=true;busted:=false;
    if next_rung=max_rung then
      maxed_out:=true;
      payout_credits:=floor(round_row.stake_credits::numeric*rung_row.payout_multiplier_bp/10000)::bigint;
      select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'streak_ladder_payout','Streak Ladder payout (maxed)',target_idempotency_key||':payout',jsonb_build_object('game','streak_ladder','rung',next_rung));
      update public.streak_ladder_rounds set current_rung=next_rung,status='cashed_out',updated_at=now() where id=target_round_id;
      credits_balance:=payout_result.balance;
      insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('streak_ladder',target_user_id,round_row.stake_credits,payout_credits,jsonb_build_object('rung',next_rung,'maxed_out',true));
    else
      maxed_out:=false;
      update public.streak_ladder_rounds set current_rung=next_rung,updated_at=now() where id=target_round_id;
      select balance into credits_balance from public.wallets where user_id=target_user_id;
    end if;
  else
    survived:=false;busted:=true;maxed_out:=false;
    update public.streak_ladder_rounds set status='busted',updated_at=now() where id=target_round_id;
    perform public.credit_platform_revenue('streak_ladder',round_row.stake_credits,'Streak Ladder bust',target_idempotency_key||':revenue',jsonb_build_object('user_id',target_user_id,'round_id',target_round_id,'rung',next_rung));
    select balance into credits_balance from public.wallets where user_id=target_user_id;
    insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('streak_ladder',target_user_id,round_row.stake_credits,0,jsonb_build_object('rung',next_rung,'busted',true));
  end if;

  round_id:=target_round_id;current_rung:=next_rung;
  return next;
end;
$$;
revoke all on function public.climb_streak_ladder_round(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.climb_streak_ladder_round(uuid,bigint,text) to service_role;

create or replace function public.cashout_streak_ladder_round(target_user_id uuid,target_round_id bigint,target_idempotency_key text)
returns table(round_id bigint,credits_balance bigint,payout_credits bigint,current_rung smallint)
language plpgsql security definer set search_path = '' as $$
declare
  round_row public.streak_ladder_rounds%rowtype;
  rung_row public.streak_ladder_rungs%rowtype;
  payout_result record;
begin
  select * into round_row from public.streak_ladder_rounds where id=target_round_id and user_id=target_user_id for update;
  if not found then raise exception 'round_not_found' using errcode='P0002'; end if;
  if round_row.status <> 'active' then raise exception 'round_not_active' using errcode='P0001'; end if;
  if round_row.current_rung < 1 then raise exception 'nothing_to_cash_out' using errcode='P0001'; end if;

  select * into rung_row from public.streak_ladder_rungs where rung=round_row.current_rung;
  payout_credits:=floor(round_row.stake_credits::numeric*rung_row.payout_multiplier_bp/10000)::bigint;

  select * into payout_result from public.apply_wallet_entry(target_user_id,payout_credits,'streak_ladder_payout','Streak Ladder cash out',target_idempotency_key||':payout',jsonb_build_object('game','streak_ladder','rung',round_row.current_rung));
  update public.streak_ladder_rounds set status='cashed_out',updated_at=now() where id=target_round_id;
  insert into public.game_rounds(game_type,user_id,stake_credits,payout_credits,outcome) values('streak_ladder',target_user_id,round_row.stake_credits,payout_credits,jsonb_build_object('rung',round_row.current_rung,'cashed_out',true));

  round_id:=target_round_id;credits_balance:=payout_result.balance;current_rung:=round_row.current_rung;
  return next;
end;
$$;
revoke all on function public.cashout_streak_ladder_round(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.cashout_streak_ladder_round(uuid,bigint,text) to service_role;
