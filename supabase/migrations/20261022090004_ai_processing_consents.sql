-- Hosted AI processing is opt-in per signed-in account and disclosure version.
create table public.ai_processing_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  disclosure_version text not null,
  provider_host text not null check (length(provider_host) between 1 and 255),
  provider_model text not null check (length(provider_model) between 1 and 120),
  agreed_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_processing_consents enable row level security;
revoke all on public.ai_processing_consents from public, anon, authenticated;
grant select, insert, update on public.ai_processing_consents to authenticated;
create policy account_ai_consent on public.ai_processing_consents
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
