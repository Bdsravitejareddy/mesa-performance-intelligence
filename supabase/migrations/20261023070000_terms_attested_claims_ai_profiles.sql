-- 1. Terms: the LMS lists each course under Pre-Term, Term 1 or Term 2 with start/end dates.
-- courses.term already exists (manual course entry); the sync now fills it from the LMS.
alter table public.courses add column starts_on date;
alter table public.courses add column ends_on date;

-- 2. Resume claims the member confirms as accurate. Kept distinct from "supported" (backed by another
--    evidence item) so the source of confidence stays visible.
alter table public.professional_claims drop constraint professional_claims_status_check;
alter table public.professional_claims add constraint professional_claims_status_check check (status in ('claimed','supported','attested','withdrawn'));
alter table public.professional_claims add column attested_at timestamptz;

-- 3. Profiles of the member written by their own AI assistants (ChatGPT, Claude) from recent conversations.
--    Third-party summaries: context for the behaviour analysis, never evidence of ability or a mark.
create table public.ai_context_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('chatgpt','claude-personal','claude-team','other')),
  window_days integer check (window_days is null or window_days between 1 and 365),
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  narrative text not null default '' check (length(narrative) <= 60000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.ai_context_reports enable row level security;
revoke all on public.ai_context_reports from public, anon, authenticated;
grant select, insert, delete on public.ai_context_reports to authenticated;
-- Personal like conversation imports: only the account that added a report can see it.
create policy own_reports on public.ai_context_reports for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger bump_workspace_data_version after insert or update or delete on public.ai_context_reports
for each statement execute function private.bump_workspace_data_version();

-- 4. The overview's AI-written summary, generated from computed figures (course demonstration, role
--    relevance, grading comparisons), one per term, regenerated only when its inputs change.
create table public.overview_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null default 'all' check (length(term) <= 40),
  input_hash text not null check (length(input_hash) = 64),
  brief jsonb not null check (jsonb_typeof(brief) = 'object'),
  provider_model text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, term, input_hash)
);
create index overview_briefs_latest_idx on public.overview_briefs(term, created_at desc);
alter table public.overview_briefs enable row level security;
revoke all on public.overview_briefs from public, anon, authenticated;
grant select, insert on public.overview_briefs to authenticated;
create policy workspace_access on public.overview_briefs for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
