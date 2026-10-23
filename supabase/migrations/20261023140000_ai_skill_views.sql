-- The AI's own reading of each skill domain from all qualitative evidence (graded work, feedback, projects,
-- conversations, self-report, reasoning tests). Every domain score must quote a verified source. Personal,
-- because it reads the member's own conversation imports and assistant profiles.
create table public.ai_skill_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domains jsonb not null check (jsonb_typeof(domains) = 'object'),
  sources jsonb not null default '{}'::jsonb,
  provider_model text not null default '',
  created_at timestamptz not null default now()
);
create index ai_skill_views_recent_idx on public.ai_skill_views(user_id, created_at desc);
alter table public.ai_skill_views enable row level security;
revoke all on public.ai_skill_views from public, anon, authenticated;
grant select, insert on public.ai_skill_views to authenticated;
create policy own_views on public.ai_skill_views for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger bump_workspace_data_version after insert or update or delete on public.ai_skill_views
for each statement execute function private.bump_workspace_data_version();
