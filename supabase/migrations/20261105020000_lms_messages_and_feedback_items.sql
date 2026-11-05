-- Nexus notifications and announcements, read daily by the LMS sync with the same read-only MCP token, so links to
-- other sources (Mesa's Feedback page, the Quiz Tool, Drive files) are noticed and flagged for import. Written by
-- the server sync only; members read them.
create table public.lms_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('notification', 'announcement')),
  source_record_id text not null check (length(source_record_id) between 1 and 300),
  title text not null default '' check (length(title) <= 400),
  body text not null default '' check (length(body) <= 8000),
  course text not null default '' check (length(course) <= 200),
  posted_at timestamptz,
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  first_seen_at timestamptz not null default now(),
  unique (user_id, source_record_id)
);
create index lms_messages_recent_idx on public.lms_messages(posted_at desc nulls last);
alter table public.lms_messages enable row level security;
revoke all on public.lms_messages from public, anon, authenticated;
grant select on public.lms_messages to authenticated;
create policy workspace_read on public.lms_messages for select to authenticated
using (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.lms_messages
for each statement execute function private.bump_workspace_data_version();

-- One row per piece of feedback the member received, split from its source (official LMS feedback, the Mesa
-- Feedback page, the blind AI grader) and tagged by theme, so the most relevant items can be retrieved and
-- conflicting advice shown side by side. Rebuilt from the sources; the member's "addressed" mark survives rebuilds.
create table public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null check (length(item_key) = 64),
  source text not null check (source in ('lms', 'mesa_feedback_page', 'ai_grader')),
  authority text not null check (authority in ('faculty', 'ai')),
  submission_id uuid references public.submissions(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  assessment_title text not null default '' check (length(assessment_title) <= 300),
  course_title text not null default '' check (length(course_title) <= 300),
  text text not null check (length(text) between 1 and 1200),
  polarity text not null check (polarity in ('strength', 'improve', 'note')),
  themes text[] not null default '{}',
  direction text check (direction is null or length(direction) <= 60),
  given_on date,
  addressed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, item_key)
);
create index feedback_items_course_idx on public.feedback_items(course_id);
alter table public.feedback_items enable row level security;
revoke all on public.feedback_items from public, anon, authenticated;
grant select, insert, update, delete on public.feedback_items to authenticated;
create policy workspace_access on public.feedback_items for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.feedback_items
for each statement execute function private.bump_workspace_data_version();
