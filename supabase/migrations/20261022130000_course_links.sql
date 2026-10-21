-- Member-confirmed links between an assessment course (LMS assessments, marks) and a Drive course (materials).
-- Records stay where they were imported; links are additive and removable.
create table public.course_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  assessment_course_id uuid not null,
  material_course_id uuid not null,
  material_course_user_id uuid not null,
  match_basis text not null default 'member_confirmed' check (match_basis in ('member_confirmed')),
  linked_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (assessment_course_id, user_id) references public.courses(id, user_id) on delete cascade,
  foreign key (material_course_id, material_course_user_id) references public.courses(id, user_id) on delete cascade,
  -- A Drive course belongs to at most one LMS course; an assessment course may have several material courses.
  unique (material_course_id),
  check (assessment_course_id <> material_course_id)
);
create index course_links_assessment_idx on public.course_links(assessment_course_id);
alter table public.course_links enable row level security;
revoke all on public.course_links from public, anon, authenticated;
grant select, insert, delete on public.course_links to authenticated;
create policy workspace_access on public.course_links
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()) and material_course_user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()) and material_course_user_id in (select private.mesa_workspace_member_ids()));

-- Links must not chain: a course used as material source cannot itself be an assessment side, and vice versa.
create or replace function private.enforce_course_link_shape()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.course_links where assessment_course_id = new.material_course_id)
     or exists (select 1 from public.course_links where material_course_id = new.assessment_course_id) then
    raise exception 'Course links cannot be chained.' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.enforce_course_link_shape() from public, anon, authenticated;
create trigger course_link_shape before insert on public.course_links
for each row execute function private.enforce_course_link_shape();

-- Submission evidence may cite material from the assessment's course or a confirmed linked material course.
create or replace function private.enforce_submission_document_material_course()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assessment_course uuid;
  v_material_course uuid;
begin
  if new.course_material_id is null then
    return new;
  end if;

  select assessment.course_id into v_assessment_course
  from public.submissions as submission
  join public.assessments as assessment
    on assessment.id = submission.assessment_id and assessment.user_id = submission.user_id
  where submission.id = new.submission_id and submission.user_id = new.user_id;

  select material.course_id into v_material_course
  from public.course_materials as material
  where material.id = new.course_material_id and material.user_id = new.user_id;

  if v_assessment_course is null or v_material_course is null then
    return new;
  end if;
  if v_material_course <> v_assessment_course and not exists (
    select 1 from public.course_links as link
    where link.assessment_course_id = v_assessment_course and link.material_course_id = v_material_course
  ) then
    raise exception 'Course material must match the submission assessment course.' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.enforce_submission_document_material_course() from public, anon, authenticated;
