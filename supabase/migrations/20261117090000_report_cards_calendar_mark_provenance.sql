-- 1. A sparse LMS refresh kept the official mark but blanked its original scale (e.g. 54.5/80 behind 68.13): from
-- 2026-11-13 the sync read no marks and wrote nulls into source_original_mark/max. A mark and its original scale
-- now travel together: when an update brings no mark, the stored mark and its scale are both kept.
create or replace function private.preserve_sparse_mesa_lms_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source_record_id like 'mesa-lms:submission:%' then
    if old.source_updated_at is not null and new.source_updated_at is not null
       and new.source_updated_at < old.source_updated_at then
      new.answer_text := old.answer_text;
      new.official_mark := old.official_mark;
      new.source_original_mark := old.source_original_mark;
      new.source_original_max_mark := old.source_original_max_mark;
      new.official_feedback := old.official_feedback;
      new.official_mark_source := old.official_mark_source;
      new.submitted_at := old.submitted_at;
      new.lms_submission_status := old.lms_submission_status;
      new.source_updated_at := old.source_updated_at;
    else
      if new.official_mark is null then
        new.official_mark := old.official_mark;
        new.source_original_mark := old.source_original_mark;
        new.source_original_max_mark := old.source_original_max_mark;
      end if;
      new.answer_text := coalesce(nullif(new.answer_text, ''), old.answer_text);
      new.official_feedback := coalesce(nullif(new.official_feedback, ''), old.official_feedback);
      new.official_mark_source := coalesce(nullif(new.official_mark_source, ''), old.official_mark_source);
      new.submitted_at := coalesce(new.submitted_at, old.submitted_at);
      new.lms_submission_status := coalesce(nullif(new.lms_submission_status, ''), old.lms_submission_status);
      new.source_updated_at := coalesce(new.source_updated_at, old.source_updated_at);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_sparse_mesa_lms_submission() from public, anon, authenticated;

-- 2. Term report cards from Nexus get_grades (Attendance & Grade → Grade): official term GPA and per-course
-- percentage, grade points, credits and letter grade. Kept apart from assessment marks so nothing is counted twice.
-- Written by the server sync only; members read them.
create table public.lms_report_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null check (length(term) between 1 and 60),
  program text not null default '' check (length(program) <= 200),
  overall_grade text not null default '' check (length(overall_grade) <= 10),
  gpa numeric(4,3),
  cgpa numeric(4,3),
  credits_earned numeric(6,2),
  credits_attempted numeric(6,2),
  attendance_pct numeric(5,2) check (attendance_pct is null or attendance_pct between 0 and 100),
  failed boolean not null default false,
  courses jsonb not null default '[]'::jsonb check (jsonb_typeof(courses) = 'array'),
  source text not null default 'Mesa LMS (Nexus MCP get_grades)',
  first_seen_at timestamptz not null default now(),
  fetched_at timestamptz not null default now(),
  unique (user_id, term)
);
alter table public.lms_report_cards enable row level security;
revoke all on public.lms_report_cards from public, anon, authenticated;
grant select on public.lms_report_cards to authenticated;
create policy workspace_read on public.lms_report_cards for select to authenticated
using (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.lms_report_cards
for each statement execute function private.bump_workspace_data_version();

-- 3. Calendar events a member adds (hackathons, competitions, interviews), shown beside Nexus deadlines.
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  kind text not null default 'event' check (kind in ('hackathon', 'competition', 'exam', 'interview', 'deadline', 'event')),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  note text not null default '' check (length(note) <= 1000),
  link text check (link is null or (link ~ '^https://' and length(link) <= 1000)),
  source text not null default 'member' check (source in ('member', 'email')),
  created_at timestamptz not null default now()
);
create index calendar_events_starts_idx on public.calendar_events(starts_at);
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from public, anon, authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
create policy workspace_access on public.calendar_events for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.calendar_events
for each statement execute function private.bump_workspace_data_version();
