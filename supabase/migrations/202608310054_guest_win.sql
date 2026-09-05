-- "Guest win" conversion funnel: anonymous visitors get one free, heavily-favoured play per day.
-- A win must be claimed (by registering) within a short window or it's forfeited. Reward is a
-- fixed Sparks amount, deliberately generous relative to normal play, to make signing up feel
-- like a strict upgrade -- membership is a separate upsell shown after the claim, not required to claim.

insert into public.app_config(key,value) values (
  'guest_win',
  '{"enabled":true,"sparksReward":250,"winProbabilityBps":9000,"claimWindowSeconds":180,"cooldownHours":20}'::jsonb
) on conflict (key) do nothing;

create table if not exists public.guest_win_grants (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null,
  sparks_reward int not null check (sparks_reward > 0),
  granted_at timestamptz not null default now(),
  claim_deadline timestamptz not null,
  claimed boolean not null default false,
  claimed_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists guest_win_grants_anon_created_idx on public.guest_win_grants(anon_id,created_at desc);
alter table public.guest_win_grants enable row level security;
revoke all on public.guest_win_grants from public,anon,authenticated;

create or replace function public.play_guest_win(target_anon_id text)
returns table(won boolean,sparks_reward int,claim_deadline timestamptz)
language plpgsql security definer set search_path='' as $$
declare cfg jsonb;cooldown_hours int;recent_count int;roll int;
begin
  if coalesce(trim(target_anon_id),'')='' then raise exception 'invalid_anonymous_session' using errcode='22023'; end if;
  select value into cfg from public.app_config where key='guest_win';
  if cfg is null or coalesce((cfg->>'enabled')::boolean,false)=false then raise exception 'guest_win_disabled' using errcode='42501'; end if;
  cooldown_hours:=coalesce((cfg->>'cooldownHours')::int,20);
  select count(*) into recent_count from public.guest_win_grants g where g.anon_id=target_anon_id and g.created_at>now()-make_interval(hours=>cooldown_hours);
  if recent_count>0 then raise exception 'guest_win_cooldown' using errcode='42901'; end if;
  roll:=floor(random()*10000)::int;
  won:=roll<coalesce((cfg->>'winProbabilityBps')::int,9000);
  if won then
    sparks_reward:=coalesce((cfg->>'sparksReward')::int,250);
    claim_deadline:=now()+make_interval(secs=>coalesce((cfg->>'claimWindowSeconds')::int,180));
    insert into public.guest_win_grants(anon_id,sparks_reward,claim_deadline) values(target_anon_id,sparks_reward,claim_deadline);
  else
    insert into public.guest_win_grants(anon_id,sparks_reward,claim_deadline,claimed) values(target_anon_id,0,now(),true);
    sparks_reward:=0;claim_deadline:=null;
  end if;
  return next;
end;
$$;
revoke all on function public.play_guest_win(text) from public,anon,authenticated;
grant execute on function public.play_guest_win(text) to service_role;

create or replace function public.guest_win_status(target_anon_id text)
returns table(sparks_reward int,claim_deadline timestamptz)
language sql security definer set search_path='' stable as $$
  select sparks_reward,claim_deadline from public.guest_win_grants
  where anon_id=target_anon_id and claimed=false and claim_deadline>now()
  order by created_at desc limit 1;
$$;
revoke all on function public.guest_win_status(text) from public,anon,authenticated;
grant execute on function public.guest_win_status(text) to service_role;

create or replace function public.claim_guest_win(target_anon_id text,target_user_id uuid)
returns table(balance bigint,sparks_reward int)
language plpgsql security definer set search_path='' as $$
declare grant_row public.guest_win_grants%rowtype;wallet_result record;
begin
  select * into grant_row from public.guest_win_grants g where g.anon_id=target_anon_id and g.claimed=false and g.claim_deadline>now() order by g.created_at desc limit 1 for update;
  if grant_row.id is null then raise exception 'guest_win_not_found_or_expired' using errcode='22023'; end if;
  update public.guest_win_grants set claimed=true,claimed_user_id=target_user_id,claimed_at=now() where id=grant_row.id;
  select * into wallet_result from public.apply_wallet_entry(target_user_id,(grant_row.sparks_reward*100)::bigint,'guest_win_claim','Free trial win claimed','guestwin:'||grant_row.id,'{}'::jsonb);
  balance:=wallet_result.balance;sparks_reward:=grant_row.sparks_reward;return next;
end;
$$;
revoke all on function public.claim_guest_win(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_guest_win(text,uuid) to service_role;
