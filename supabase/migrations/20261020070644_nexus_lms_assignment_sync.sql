-- Stable LMS source identifiers make daily imports safe to retry.
alter table public.courses add column lms_course_id text;
create unique index courses_lms_source_user_uidx on public.courses(user_id, lms_course_id);

create unique index assessments_source_record_user_uidx
  on public.assessments(user_id, source_record_id);

alter table public.submissions add column source_record_id text;
alter table public.submissions add column lms_submission_status text not null default '';
alter table public.submissions add column source_updated_at timestamptz;
create unique index submissions_source_record_user_uidx
  on public.submissions(user_id, source_record_id);
