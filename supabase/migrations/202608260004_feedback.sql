create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  account_user_id uuid references auth.users(id) on delete set null,
  message text not null check(length(message) between 10 and 2000),
  status text not null default 'received' check(status in ('received','reviewed','planned','declined')),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon,authenticated;
grant insert on public.feedback to service_role;

create or replace function public.admin_update_feedback(admin_id uuid,target_id uuid,new_status text)
returns public.feedback
language plpgsql security definer set search_path=public as $$
declare before_row public.feedback; after_row public.feedback;
begin
  if new_status not in ('received','reviewed','planned','declined') then raise exception 'invalid_feedback_status'; end if;
  select * into before_row from public.feedback where id=target_id for update;
  if before_row is null then raise exception 'feedback_not_found'; end if;
  update public.feedback set status=new_status where id=target_id returning * into after_row;
  insert into public.admin_audit(admin_user_id,action,target_type,target_ref,before_value,after_value)
  values(admin_id,'feedback.'||new_status,'feedback',target_id::text,to_jsonb(before_row),to_jsonb(after_row));
  return after_row;
end;$$;

revoke all on function public.admin_update_feedback(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_update_feedback(uuid,uuid,text) to service_role;
