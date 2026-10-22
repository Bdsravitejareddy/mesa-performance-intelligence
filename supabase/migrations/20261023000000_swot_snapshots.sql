-- Each change to the evidence-based SWOT is kept, so the page can show what is new or resolved since last time.
create table public.swot_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  items_hash text not null check (length(items_hash) = 64),
  created_at timestamptz not null default now()
);
create index swot_snapshots_recent_idx on public.swot_snapshots(created_at desc);
alter table public.swot_snapshots enable row level security;
revoke all on public.swot_snapshots from public, anon, authenticated;
grant select, insert on public.swot_snapshots to authenticated;
create policy workspace_access on public.swot_snapshots for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
