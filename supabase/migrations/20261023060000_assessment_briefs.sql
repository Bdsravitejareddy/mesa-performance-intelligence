-- The assignment brief (description, instructions, attached-material names) from the LMS's read-only
-- get_assignment tool. Grading derives criteria from the brief when no official or approved rubric exists,
-- instead of from generic course material, and the blind evaluator sees the task it is grading against.
alter table public.assessments add column brief text not null default '' check (length(brief) <= 20000);
alter table public.assessments add column brief_fetched_at timestamptz;

alter table public.submission_gradings drop constraint submission_gradings_standard_source_check;
alter table public.submission_gradings add constraint submission_gradings_standard_source_check
  check (standard_source in ('official_rubric','approved_rubric','assignment_brief_inferred','course_objectives_inferred'));
