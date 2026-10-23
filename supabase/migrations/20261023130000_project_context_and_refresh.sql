-- 1. Context the member adds to a self-directed project: the problem statement they were given (used only as
--    the standard a project is judged against, never as evidence of their communication) or a write-up in their
--    own words (evidence of communication, problem solving and first-principles reasoning).
create table public.project_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_key text not null check (length(project_key) between 1 and 200),
  kind text not null check (kind in ('problem_statement','own_words')),
  title text not null default '' check (length(title) <= 300),
  body text not null check (length(body) between 1 and 60000),
  file_name text,
  created_at timestamptz not null default now()
);
create index project_contexts_key_idx on public.project_contexts(project_key);
alter table public.project_contexts enable row level security;
revoke all on public.project_contexts from public, anon, authenticated;
grant select, insert, delete on public.project_contexts to authenticated;
create policy workspace_access on public.project_contexts for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.project_contexts
for each statement execute function private.bump_workspace_data_version();

-- 2. Blind evaluations of each project against its problem statement (or default project criteria).
create table public.project_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null,
  input_hash text not null,
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  provider_model text not null default '',
  created_at timestamptz not null default now()
);
create index project_evaluations_key_idx on public.project_evaluations(project_key, created_at desc);
alter table public.project_evaluations enable row level security;
revoke all on public.project_evaluations from public, anon, authenticated;
grant select on public.project_evaluations to authenticated;
create policy workspace_access on public.project_evaluations for select to authenticated
using (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.project_evaluations
for each statement execute function private.bump_workspace_data_version();

-- 3. GitHub App installations a member connected, so the nightly refresh can read the same repositories with a
--    short-lived installation token. Identifiers only; no token is stored. Service role only.
create table public.github_installations (
  installation_id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account text not null,
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_error text
);
alter table public.github_installations enable row level security;
revoke all on public.github_installations from public, anon, authenticated;
grant select on public.github_installations to authenticated;
create policy workspace_read on public.github_installations for select to authenticated
using (user_id in (select private.mesa_workspace_member_ids()));
