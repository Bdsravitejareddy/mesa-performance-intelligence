-- AI-written wording for the SWOT story, keyed by its findings and writing-rules version, so changed rules or
-- evidence produce a new write-up instead of reusing an old one. Facts, ranking and evidence are never stored here.
create table public.swot_narratives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  input_hash text not null check (length(input_hash) = 64),
  rules_version text not null check (length(rules_version) between 1 and 60),
  narrative jsonb not null check (jsonb_typeof(narrative) = 'object'),
  provider_model text not null default '' check (length(provider_model) <= 120),
  created_at timestamptz not null default now()
);
create index swot_narratives_hash_idx on public.swot_narratives(input_hash);
alter table public.swot_narratives enable row level security;
revoke all on public.swot_narratives from public, anon, authenticated;
grant select, insert on public.swot_narratives to authenticated;
create policy workspace_access on public.swot_narratives for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.swot_narratives
for each statement execute function private.bump_workspace_data_version();
