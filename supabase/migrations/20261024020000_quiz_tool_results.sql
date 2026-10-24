-- Results read from the Cohort 4 Quiz Tool through the member's own signed-in browser (member-approved, read-only;
-- see AGENTS.md). A separately labelled source: summed on its own and never part of official marks or totals.
-- correct/total count distinct questions; `shown` keeps the tool's own figure (it can list a question twice).
create table public.quiz_tool_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course text not null check (length(course) between 1 and 120),
  term text not null default '' check (length(term) <= 40),
  session text not null check (length(session) between 1 and 60),
  correct integer not null check (correct >= 0),
  total integer not null check (total > 0 and correct <= total),
  shown text not null default '' check (length(shown) <= 40),
  missed jsonb not null default '[]'::jsonb check (jsonb_typeof(missed) = 'array'),
  note text not null default '' check (length(note) <= 400),
  captured_at timestamptz not null default now(),
  unique (user_id, course, term, session)
);
alter table public.quiz_tool_results enable row level security;
revoke all on public.quiz_tool_results from public, anon, authenticated;
grant select, insert, update on public.quiz_tool_results to authenticated;
create policy workspace_access on public.quiz_tool_results for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
