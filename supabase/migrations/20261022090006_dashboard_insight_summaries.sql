-- Cached whole-workspace summaries remain private to the account that requested them.
create table public.dashboard_insight_summaries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  input_hash text not null check (length(input_hash) = 64),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  source_references jsonb not null default '[]'::jsonb check (jsonb_typeof(source_references) = 'array'),
  sample_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(sample_counts) = 'object'),
  provider_model text not null default '',
  created_at timestamptz not null default now()
);
alter table public.dashboard_insight_summaries enable row level security;
revoke all on public.dashboard_insight_summaries from public, anon, authenticated;
grant select, insert, update, delete on public.dashboard_insight_summaries to authenticated;
create policy account_dashboard_summary on public.dashboard_insight_summaries
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
