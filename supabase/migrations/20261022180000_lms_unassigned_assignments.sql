-- LMS assignments that arrive without a course reference are kept here instead of being discarded.
-- A course is resolved automatically from unambiguous evidence or confirmed by a member; the record is
-- then imported like any other assignment on the next sync (or immediately on confirmation).
create table public.lms_unassigned_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_record_id text not null unique check (source_record_id like 'mesa-lms:assignment:%'),
  title text not null check (length(trim(title)) > 0),
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  suggested_course_id uuid,
  suggestion_basis text not null default '' check (length(suggestion_basis) <= 300),
  resolved_course_id uuid,
  resolution text check (resolution in ('auto_title','member')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  foreign key (suggested_course_id) references public.courses(id) on delete set null,
  foreign key (resolved_course_id) references public.courses(id) on delete set null,
  check ((resolved_course_id is null) = (resolution is null))
);
alter table public.lms_unassigned_assignments enable row level security;
revoke all on public.lms_unassigned_assignments from public, anon, authenticated;
grant select, update on public.lms_unassigned_assignments to authenticated;
create policy workspace_access on public.lms_unassigned_assignments
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
