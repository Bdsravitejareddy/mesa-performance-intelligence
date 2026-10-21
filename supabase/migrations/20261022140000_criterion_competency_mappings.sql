-- Optional criterion-level mapping: a competency can be tied to one criterion of an assessment
-- (as written in official feedback) instead of the whole assessment mark. Null means whole assessment.
alter table public.assessment_competencies
  add column criterion_label text check (criterion_label is null or length(trim(criterion_label)) between 1 and 80);

alter table public.assessment_competencies
  drop constraint assessment_competencies_assessment_id_competency_id_key;

create unique index assessment_competencies_unique_scope
  on public.assessment_competencies(assessment_id, competency_id, coalesce(criterion_label, ''));
