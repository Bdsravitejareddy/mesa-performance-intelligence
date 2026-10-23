-- Self-directed work from the member's GitHub and Vercel accounts: repository metadata, languages, dependency
-- names, README openings, commit months and deployment counts. Never source code or tokens. Collected locally by
-- scripts/collect-portfolio.mjs; read like other workspace evidence.
create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('github','vercel')),
  account text not null,
  external_id text not null,
  name text not null,
  url text,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  collected_at timestamptz not null default now(),
  unique (source, external_id)
);
alter table public.portfolio_items enable row level security;
revoke all on public.portfolio_items from public, anon, authenticated;
grant select, delete on public.portfolio_items to authenticated;
create policy workspace_access on public.portfolio_items for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.portfolio_items
for each statement execute function private.bump_workspace_data_version();
