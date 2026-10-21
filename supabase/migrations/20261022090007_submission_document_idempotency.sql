-- Make retrying an evidence POST idempotent after a lost client response.
create unique index submission_upload_version_unique
  on public.submission_documents(submission_id, source_version)
  where source_kind = 'upload';

create unique index submission_material_version_unique
  on public.submission_documents(submission_id, course_material_id, source_version)
  where source_kind in ('drive', 'lms') and course_material_id is not null;
