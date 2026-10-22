-- Automatic recognition of the student's own submissions among imported Drive files.
-- A file is shortlisted by title against the assessments of its linked course, then classified;
-- every decision keeps its basis so it can be inspected or overturned.
create table public.material_submission_matches (
  material_id uuid primary key,
  user_id uuid not null,
  assessment_id uuid,
  assessment_user_id uuid,
  unassigned_id uuid references public.lms_unassigned_assignments(id) on delete set null,
  kind text not null check (kind in ('submission','course_material','undetermined')),
  title_score numeric(4,3) not null default 0 check (title_score between 0 and 1),
  method text not null check (method in ('title_and_ai','title_only','member')),
  confidence text not null check (confidence in ('high','medium','low')),
  reason text not null default '' check (length(reason) <= 600),
  provider_model text not null default '',
  submission_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (material_id, user_id) references public.course_materials(id, user_id) on delete cascade,
  foreign key (assessment_id, assessment_user_id) references public.assessments(id, user_id) on delete cascade,
  check ((assessment_id is null) = (assessment_user_id is null))
);
create index material_submission_matches_assessment_idx on public.material_submission_matches(assessment_id);
alter table public.material_submission_matches enable row level security;
revoke all on public.material_submission_matches from public, anon, authenticated;
grant select, insert, update, delete on public.material_submission_matches to authenticated;
create policy workspace_access on public.material_submission_matches
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

-- Held LMS assignments can also be filed from a matching Drive file's course folder.
alter table public.lms_unassigned_assignments drop constraint lms_unassigned_assignments_resolution_check;
alter table public.lms_unassigned_assignments add constraint lms_unassigned_assignments_resolution_check check (resolution in ('auto_title','member','drive'));

-- Submission evidence may come from Word and Excel files as well as PDF and PowerPoint.
alter table public.submission_documents drop constraint submission_documents_mime_type_check;
alter table public.submission_documents add constraint submission_documents_mime_type_check check (mime_type in (
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
));
