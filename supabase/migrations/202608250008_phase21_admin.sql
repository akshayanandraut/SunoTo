create table if not exists public.restrictions (
  target_ref text primary key,
  status text not null check(status in ('restricted','banned')),
  reason text not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.restrictions enable row level security;
revoke all on public.restrictions from anon,authenticated;

create or replace function public.admin_dashboard_snapshot()
returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object(
  'accountHolders',(select count(*) from auth.users),
  'verifiedAccounts',(select count(*) from auth.users where email_confirmed_at is not null),
  'totalCredits',(select coalesce(sum(balance),0) from public.wallets),
  'reports',(select count(*) from public.reports),
  'restrictions',(select count(*) from public.restrictions where active),
  'likes',(select count(*) from public.likes),
  'rechargePaise',(select coalesce(sum(amount_paise),0) from public.payment_orders where status='paid'),
  'paidMessages',(select count(*) from public.wallet_ledger where entry_type='paid_message'),
  'preferenceUses',(select count(*) from public.wallet_ledger where entry_type='preference_match'),
  'contactUnlocks',(select count(*)/2 from public.wallet_ledger where entry_type='contact_unlock'),
  'reconnects',(select count(*) from public.wallet_ledger where entry_type='favourite_reconnect'),
  'dailyVisitors',null,'aiUsage',null
);$$;

create or replace function public.admin_list_users(result_limit integer default 50,result_offset integer default 0)
returns table(user_id uuid,public_id uuid,username text,email text,email_verified boolean,created_at timestamptz,balance bigint,restriction_status text,report_count bigint,risk_score numeric,like_count bigint)
language sql security definer set search_path='' as $$
select u.id,p.public_id,p.username::text,u.email,u.email_confirmed_at is not null,u.created_at,coalesce(w.balance,0),r.status,(select count(*) from public.reports x where x.target_ref=p.public_id::text),coalesce(rs.recent_score,0),coalesce(rep.like_count,0)
from auth.users u left join public.profiles p on p.user_id=u.id left join public.wallets w on w.user_id=u.id left join public.restrictions r on r.target_ref=p.public_id::text and r.active left join public.risk_scores rs on rs.target_ref=p.public_id::text left join public.reputation_scores rep on rep.target_ref=p.public_id::text
order by u.created_at desc limit least(greatest(result_limit,1),100) offset greatest(result_offset,0);$$;

create or replace function public.admin_adjust_wallet(admin_id uuid,target_user_id uuid,credit_delta bigint,ledger_reason text,operation_id text)
returns table(ledger_id bigint,balance bigint,idempotent boolean)
language plpgsql security definer set search_path='' as $$
declare result record;
begin
  if length(trim(ledger_reason))<4 then raise exception 'admin_reason_required';end if;
  select * into result from public.apply_wallet_entry(target_user_id,credit_delta,'admin_adjustment',trim(ledger_reason),'admin:wallet:'||operation_id,jsonb_build_object('admin_id',admin_id));
  if not result.idempotent then insert into public.admin_audit(admin_user_id,action,target_type,target_ref,after_value) values(admin_id,'wallet.adjust','user',target_user_id::text,jsonb_build_object('delta',credit_delta,'reason',trim(ledger_reason),'balance',result.balance));end if;
  ledger_id:=result.ledger_id;balance:=result.balance;idempotent:=result.idempotent;return next;
end;$$;

create or replace function public.admin_set_restriction(admin_id uuid,target text,new_status text,restriction_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;
begin
  if length(target)<8 or new_status not in ('restricted','banned','clear') or length(trim(restriction_reason))<4 then raise exception 'invalid_restriction';end if;
  select to_jsonb(r) into before_row from public.restrictions r where target_ref=target for update;
  if new_status='clear' then update public.restrictions set active=false,reason=trim(restriction_reason),updated_at=now(),created_by=admin_id where target_ref=target;
  else insert into public.restrictions(target_ref,status,reason,created_by) values(target,new_status,trim(restriction_reason),admin_id) on conflict(target_ref) do update set status=excluded.status,reason=excluded.reason,active=true,created_by=excluded.created_by,updated_at=now();end if;
  select to_jsonb(r) into after_row from public.restrictions r where target_ref=target;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'restriction.'||new_status,'identity',target,before_row,after_row);return after_row;
end;$$;

create or replace function public.update_virtual_config(admin_id uuid,expected_version bigint,new_value jsonb)
returns table(value jsonb,version bigint,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare current_row public.app_config%rowtype;
begin
  select * into current_row from public.app_config where key='virtual' for update;if not found then raise exception 'virtual_config_missing';end if;if current_row.version<>expected_version then raise exception 'config_version_conflict';end if;
  update public.app_config set value=new_value,version=current_row.version+1,updated_at=now(),updated_by=admin_id where key='virtual' returning app_config.value,app_config.version,app_config.updated_at into value,version,updated_at;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'config.update','app_config','virtual',current_row.value,new_value);return next;
end;$$;

create or replace function public.admin_save_promotion(admin_id uuid,promotion_type text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_id uuid;before_row jsonb;after_row jsonb;
begin
  if promotion_type not in ('offer','coupon') then raise exception 'invalid_promotion_type';end if;
  target_id:=nullif(payload->>'id','')::uuid;
  if promotion_type='offer' then
    if target_id is not null then select to_jsonb(o) into before_row from public.offers o where id=target_id for update;end if;
    if target_id is null then insert into public.offers(name,multiplier_bps,fixed_bonus,min_recharge_paise,starts_at,ends_at,automatic,combinable,enabled) values(payload->>'name',(payload->>'multiplier_bps')::integer,(payload->>'fixed_bonus')::bigint,(payload->>'min_recharge_paise')::bigint,(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,coalesce((payload->>'automatic')::boolean,true),coalesce((payload->>'combinable')::boolean,false),coalesce((payload->>'enabled')::boolean,true)) returning id into target_id;
    else update public.offers set name=payload->>'name',multiplier_bps=(payload->>'multiplier_bps')::integer,fixed_bonus=(payload->>'fixed_bonus')::bigint,min_recharge_paise=(payload->>'min_recharge_paise')::bigint,starts_at=(payload->>'starts_at')::timestamptz,ends_at=(payload->>'ends_at')::timestamptz,automatic=(payload->>'automatic')::boolean,combinable=(payload->>'combinable')::boolean,enabled=(payload->>'enabled')::boolean where id=target_id;end if;
    select to_jsonb(o) into after_row from public.offers o where id=target_id;
  else
    if target_id is not null then select to_jsonb(c) into before_row from public.coupons c where id=target_id for update;end if;
    if target_id is null then insert into public.coupons(code,multiplier_bps,fixed_bonus,min_recharge_paise,starts_at,ends_at,max_redemptions,max_uses_per_account,audience,combinable,enabled) values(upper(payload->>'code'),(payload->>'multiplier_bps')::integer,(payload->>'fixed_bonus')::bigint,(payload->>'min_recharge_paise')::bigint,(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,nullif(payload->>'max_redemptions','')::integer,(payload->>'max_uses_per_account')::integer,payload->>'audience',(payload->>'combinable')::boolean,(payload->>'enabled')::boolean) returning id into target_id;
    else update public.coupons set code=upper(payload->>'code'),multiplier_bps=(payload->>'multiplier_bps')::integer,fixed_bonus=(payload->>'fixed_bonus')::bigint,min_recharge_paise=(payload->>'min_recharge_paise')::bigint,starts_at=(payload->>'starts_at')::timestamptz,ends_at=(payload->>'ends_at')::timestamptz,max_redemptions=nullif(payload->>'max_redemptions','')::integer,max_uses_per_account=(payload->>'max_uses_per_account')::integer,audience=payload->>'audience',combinable=(payload->>'combinable')::boolean,enabled=(payload->>'enabled')::boolean where id=target_id;end if;
    select to_jsonb(c) into after_row from public.coupons c where id=target_id;
  end if;
  if after_row is null then raise exception 'promotion_not_found';end if;insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value) values(admin_id,'promotion.save',promotion_type,target_id::text,before_row,after_row);return after_row;
end;$$;

revoke all on function public.admin_dashboard_snapshot(),public.admin_list_users(integer,integer),public.admin_adjust_wallet(uuid,uuid,bigint,text,text),public.admin_set_restriction(uuid,text,text,text),public.update_virtual_config(uuid,bigint,jsonb),public.admin_save_promotion(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_dashboard_snapshot(),public.admin_list_users(integer,integer),public.admin_adjust_wallet(uuid,uuid,bigint,text,text),public.admin_set_restriction(uuid,text,text,text),public.update_virtual_config(uuid,bigint,jsonb),public.admin_save_promotion(uuid,text,jsonb) to service_role;
