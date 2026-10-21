-- Make retrying an evidence POST idempotent after a lost client response.
do $$
declare
  duplicate_upload_groups bigint;
  duplicate_material_groups bigint;
  cross_course_links bigint;
begin
  select count(*) into duplicate_upload_groups
  from (
    select submission_id, source_version
    from public.submission_documents
    where source_kind = 'upload'
    group by submission_id, source_version
    having count(*) > 1
  ) as duplicates;
  select count(*) into duplicate_material_groups
  from (
    select submission_id, course_material_id, source_version
    from public.submission_documents
    where source_kind in ('drive', 'lms') and course_material_id is not null
    group by submission_id, course_material_id, source_version
    having count(*) > 1
  ) as duplicates;
  if duplicate_upload_groups > 0 or duplicate_material_groups > 0 then
    raise exception 'Cannot enforce submission evidence idempotency: found % duplicate upload version group(s) and % duplicate course-material version group(s). Review and resolve duplicate rows in submission_documents before retrying this migration; do not delete storage objects automatically.', duplicate_upload_groups, duplicate_material_groups
      using errcode = '23505';
  end if;

  select count(*) into cross_course_links
  from public.submission_documents as evidence
  join public.submissions as submission on submission.id = evidence.submission_id and submission.user_id = evidence.user_id
  join public.assessments as assessment on assessment.id = submission.assessment_id and assessment.user_id = submission.user_id
  join public.course_materials as material on material.id = evidence.course_material_id and material.user_id = evidence.user_id
  where material.course_id <> assessment.course_id;
  if cross_course_links > 0 then
    raise exception 'Cannot enforce submission evidence course matching: found % cross-course material link(s). Review and correct course_material_id links in submission_documents before retrying this migration.', cross_course_links
      using errcode = '23503';
  end if;
end
$$;

create or replace function private.enforce_submission_document_material_course()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  assessment_course_id uuid;
  material_course_id uuid;
begin
  if new.course_material_id is null then
    return new;
  end if;

  select assessment.course_id into assessment_course_id
  from public.submissions as submission
  join public.assessments as assessment
    on assessment.id = submission.assessment_id and assessment.user_id = submission.user_id
  where submission.id = new.submission_id and submission.user_id = new.user_id;

  select material.course_id into material_course_id
  from public.course_materials as material
  where material.id = new.course_material_id and material.user_id = new.user_id;

  -- Let the declared foreign keys report missing or cross-owner rows.
  if assessment_course_id is null or material_course_id is null then
    return new;
  end if;
  if material_course_id <> assessment_course_id then
    raise exception 'Course material must match the submission assessment course.' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.enforce_submission_document_material_course() from public, anon, authenticated;

drop trigger if exists submission_document_material_course on public.submission_documents;
create trigger submission_document_material_course
before insert or update of submission_id, user_id, course_material_id
on public.submission_documents
for each row execute function private.enforce_submission_document_material_course();

create unique index submission_upload_version_unique
  on public.submission_documents(submission_id, source_version)
  where source_kind = 'upload';

create unique index submission_material_version_unique
  on public.submission_documents(submission_id, course_material_id, source_version)
  where source_kind in ('drive', 'lms') and course_material_id is not null;
