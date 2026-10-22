-- Independent Quality Checker runs. The blind pass sees only the work and the chosen standard; the optional
-- contextual pass is stored separately so context can never inflate the first impression.
alter table public.quality_checks
  add column mode text not null default 'criteria' check (mode in ('criteria','role')),
  add column standard_source text not null default 'member_supplied' check (standard_source in ('official_rubric','approved_rubric','course_objectives_inferred','role_profile','model_general','member_supplied')),
  add column standard_label text not null default '' check (length(standard_label) <= 300),
  add column assessment_id uuid,
  add column role_profile_id uuid,
  add column submission_document_id uuid,
  add column work_kind text not null default 'written_answer' check (work_kind in ('written_answer','case_solution','presentation','resume','project','proposal','interview_response','other')),
  add column blind_report jsonb not null default '{}'::jsonb check (jsonb_typeof(blind_report) = 'object'),
  add column contextual_report jsonb check (contextual_report is null or jsonb_typeof(contextual_report) = 'object'),
  add column overall_score numeric(5,2) check (overall_score is null or overall_score between 0 and 100),
  add column provider_model text not null default '',
  add column previous_check_id uuid references public.quality_checks(id) on delete set null,
  add column created_by uuid references auth.users(id) on delete set null default auth.uid();
create index quality_checks_lineage_idx on public.quality_checks(user_id, title, created_at desc);
