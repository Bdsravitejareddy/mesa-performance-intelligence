alter table public.assessments
  add column if not exists source_max_mark numeric(7,2);

alter table public.submissions
  add column if not exists source_original_mark numeric(7,2),
  add column if not exists source_original_max_mark numeric(7,2);

comment on column public.assessments.source_max_mark is
  'Original maximum reported by the LMS; official_max_mark remains on the platform 0–100 scale.';
comment on column public.submissions.source_original_mark is
  'Earned mark reported by the LMS before conversion to the platform 0–100 scale.';
comment on column public.submissions.source_original_max_mark is
  'Maximum reported by the LMS for source_original_mark.';
