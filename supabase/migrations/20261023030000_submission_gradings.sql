-- Automatic grading of each submission against course content, kept as three independent views that are
-- shown side by side and never averaged: a deterministic code score (coverage of rubric and course concepts),
-- a blind AI score (the model never sees the official mark), and the official mark and feedback as recorded.
-- A new row is written only when the inputs change (input_hash), so earlier gradings are kept as history.
create table public.submission_gradings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  assessment_id uuid not null,
  input_hash text not null check (length(input_hash) = 64),
  standard_source text not null check (standard_source in ('official_rubric','approved_rubric','course_objectives_inferred')),
  standard_label text not null default '' check (length(standard_label) <= 300),
  standard jsonb not null check (jsonb_typeof(standard) = 'object'),
  code_score numeric(5,2) check (code_score is null or code_score between 0 and 100),
  code_report jsonb not null default '{}'::jsonb check (jsonb_typeof(code_report) = 'object'),
  ai_score numeric(5,2) check (ai_score is null or ai_score between 0 and 100),
  ai_report jsonb check (ai_report is null or jsonb_typeof(ai_report) = 'object'),
  ai_status text not null default 'pending' check (ai_status in ('pending','complete','failed','skipped')),
  official_mark numeric(5,2) check (official_mark is null or official_mark between 0 and 100),
  comparison jsonb not null default '{}'::jsonb check (jsonb_typeof(comparison) = 'object'),
  provider_model text not null default '',
  rules_version text not null default '',
  created_at timestamptz not null default now(),
  unique (submission_id, input_hash),
  foreign key (submission_id, user_id) references public.submissions(id, user_id) on delete cascade,
  foreign key (assessment_id, user_id) references public.assessments(id, user_id) on delete cascade
);
create index submission_gradings_latest_idx on public.submission_gradings(submission_id, created_at desc);
create index submission_gradings_assessment_idx on public.submission_gradings(assessment_id, created_at desc);
alter table public.submission_gradings enable row level security;
revoke all on public.submission_gradings from public, anon, authenticated;
grant select, insert, update on public.submission_gradings to authenticated;
create policy workspace_access on public.submission_gradings for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.submission_gradings
for each statement execute function private.bump_workspace_data_version();
