begin;

create table public.grasany_identity_links (
  issuer text not null check (issuer = 'https://grtjbgksspckvtrvwwbm.supabase.co/auth/v1'),
  subject text not null check (length(subject) between 1 and 255 and btrim(subject) <> ''),
  account_id uuid not null references public.profiles(user_id) on delete cascade,
  primary key (issuer, subject),
  unique (issuer, account_id)
);
create index grasany_identity_links_account_idx on public.grasany_identity_links (account_id);
alter table public.grasany_identity_links enable row level security;
revoke all on table public.grasany_identity_links from public, anon, authenticated, service_role;
grant select on table public.grasany_identity_links to service_role;
comment on table public.grasany_identity_links is 'Explicit central identity links; no email matching, automatic enrollment, browser access or role grants.';

commit;
