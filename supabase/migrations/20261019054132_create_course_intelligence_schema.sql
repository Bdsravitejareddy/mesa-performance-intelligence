create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null default '',
  title text not null,
  term text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (length(trim(title)) > 0)
);

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, course_id),
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade
);

create table public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  code text not null default '',
  description text not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, course_id),
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade,
  check (length(trim(description)) > 0)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  title text not null,
  assessment_format text not null default 'written',
  official_max_mark numeric(7,2) not null default 100,
  due_at timestamptz,
  source_record_id text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, course_id),
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade,
  check (official_max_mark > 0),
  check (length(trim(title)) > 0)
);

create table public.course_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  module_id uuid,
  assessment_id uuid,
  name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size bigint not null,
  version integer not null default 1,
  source_kind text not null default 'course_upload'
    check (source_kind in ('syllabus','slides','notes','case_study','assignment','rubric','reading','sample_answer','faculty_example','assessment_paper','answer_key','course_upload')),
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','complete','failed','needs_visual_review')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade,
  foreign key (module_id, user_id, course_id) references public.course_modules(id, user_id, course_id) on delete set null (module_id),
  foreign key (assessment_id, user_id, course_id) references public.assessments(id, user_id, course_id) on delete set null (assessment_id),
  check (file_size > 0),
  check (version > 0),
  check (length(trim(name)) > 0)
);

create table public.material_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null,
  page_number integer not null,
  extracted_text text not null default '',
  table_data jsonb not null default '[]'::jsonb,
  has_visuals boolean not null default false,
  visual_notes text not null default '',
  search_document tsvector generated always as (to_tsvector('simple', coalesce(extracted_text, ''))) stored,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (material_id, user_id) references public.course_materials(id, user_id) on delete cascade,
  check (page_number > 0)
);

create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_id uuid not null,
  source_kind text not null check (source_kind in ('official','inferred')),
  approval_status text not null default 'pending_review'
    check (approval_status in ('pending_review','approved','rejected')),
  maximum_marks numeric(7,2) not null,
  source_material_id uuid,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (id, user_id),
  foreign key (assessment_id, user_id) references public.assessments(id, user_id) on delete cascade,
  foreign key (source_material_id, user_id) references public.course_materials(id, user_id) on delete set null (source_material_id),
  check (maximum_marks > 0),
  check ((source_kind = 'official' and approval_status = 'approved') or source_kind = 'inferred')
);

create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rubric_id uuid not null,
  title text not null,
  description text not null default '',
  weight numeric(7,2) not null,
  maximum_marks numeric(7,2) not null,
  source_reference text not null default '',
  created_at timestamptz not null default now(),
  foreign key (rubric_id, user_id) references public.rubrics(id, user_id) on delete cascade,
  check (weight >= 0),
  check (maximum_marks > 0)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_id uuid not null,
  storage_path text,
  answer_text text not null default '',
  official_mark numeric(5,2),
  official_feedback text not null default '',
  official_mark_source text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (assessment_id, user_id) references public.assessments(id, user_id) on delete cascade,
  check (official_mark is null or (official_mark >= 0 and official_mark <= 100))
);

create table public.evaluation_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  mesa_academic_score numeric(5,2),
  analytical_score numeric(5,2),
  professional_score numeric(5,2),
  status text not null default 'draft' check (status in ('draft','reviewed','approved','insufficient_evidence')),
  provider_model text not null default '',
  input_hash text not null,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (submission_id, user_id) references public.submissions(id, user_id) on delete cascade,
  check (mesa_academic_score is null or mesa_academic_score between 0 and 100),
  check (analytical_score is null or analytical_score between 0 and 100),
  check (professional_score is null or professional_score between 0 and 100)
);

create table public.material_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  material_page_id uuid not null,
  reference_label text not null,
  excerpt text not null default '',
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (material_page_id, user_id) references public.material_pages(id, user_id) on delete cascade
);

create table public.evaluation_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evaluation_id uuid not null,
  material_reference_id uuid,
  layer text not null check (layer in ('mesa_academic','analytical','professional')),
  criterion text not null,
  finding text not null,
  submission_quote text not null default '',
  confidence text not null default 'medium' check (confidence in ('high','medium','low','insufficient')),
  created_at timestamptz not null default now(),
  foreign key (evaluation_id, user_id) references public.evaluation_reports(id, user_id) on delete cascade,
  foreign key (material_reference_id, user_id) references public.material_references(id, user_id) on delete set null (material_reference_id)
);

create table public.topic_competencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  learning_objective_id uuid,
  topic text not null,
  state text not null check (state in ('not_yet_taught','taught_not_assessed','insufficient_evidence','demonstrated','development_needed')),
  score numeric(5,2),
  evidence_count integer not null default 0,
  evidence_summary text not null default '',
  updated_at timestamptz not null default now(),
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade,
  foreign key (learning_objective_id, user_id) references public.learning_objectives(id, user_id) on delete set null (learning_objective_id),
  check (evidence_count >= 0),
  check (score is null or score between 0 and 100)
);

create table public.swot_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('strength','weakness','opportunity','threat')),
  title text not null,
  evidence text not null default '',
  source_reference text not null default '',
  created_at timestamptz not null default now()
);

create table public.role_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  industry text not null default '',
  benchmark_source text not null default 'user_supplied',
  competencies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.resume_gap_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_profile_id uuid,
  competency text not null,
  evidence_found text not null default '',
  gap text not null default '',
  source_reference text not null default '',
  created_at timestamptz not null default now(),
  foreign key (role_profile_id, user_id) references public.role_profiles(id, user_id) on delete set null (role_profile_id)
);

create table public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content_hash text not null,
  findings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_name text not null default 'Mesa LMS',
  status text not null check (status in ('disabled','running','succeeded','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  message text not null default ''
);

create index course_modules_course_user_idx on public.course_modules(course_id, user_id);
create index objectives_course_user_idx on public.learning_objectives(course_id, user_id);
create index assessments_course_user_idx on public.assessments(course_id, user_id);
create index materials_course_user_idx on public.course_materials(course_id, user_id);
create index materials_assessment_user_idx on public.course_materials(assessment_id, user_id);
create index material_pages_material_user_idx on public.material_pages(material_id, user_id);
create index material_pages_search_idx on public.material_pages using gin(search_document);
create index rubric_criteria_rubric_user_idx on public.rubric_criteria(rubric_id, user_id);
create index submissions_assessment_user_idx on public.submissions(assessment_id, user_id);
create index evaluations_submission_user_idx on public.evaluation_reports(submission_id, user_id);
create index evaluations_cache_idx on public.evaluation_reports(user_id, submission_id, input_hash);
create index evidence_evaluation_user_idx on public.evaluation_evidence(evaluation_id, user_id);
create index evidence_reference_user_idx on public.evaluation_evidence(material_reference_id, user_id);
create index competencies_course_user_idx on public.topic_competencies(course_id, user_id);
create index resume_gaps_profile_user_idx on public.resume_gap_findings(role_profile_id, user_id);

do $$
declare
  table_name text;
  app_tables text[] := array[
    'courses', 'course_modules', 'learning_objectives', 'assessments', 'course_materials',
    'material_pages', 'rubrics', 'rubric_criteria', 'submissions', 'evaluation_reports',
    'material_references', 'evaluation_evidence', 'topic_competencies', 'swot_entries',
    'role_profiles', 'resume_gap_findings', 'quality_checks', 'sync_runs'
  ];
begin
  foreach table_name in array app_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format(
      'create policy owner_access on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name
    );
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-files',
  'course-files',
  false,
  20971520,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

create policy "course files owner select" on storage.objects
for select to authenticated
using (bucket_id = 'course-files' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "course files owner insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'course-files' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "course files owner update" on storage.objects
for update to authenticated
using (bucket_id = 'course-files' and (select auth.uid())::text = (storage.foldername(name))[1])
with check (bucket_id = 'course-files' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "course files owner delete" on storage.objects
for delete to authenticated
using (bucket_id = 'course-files' and (select auth.uid())::text = (storage.foldername(name))[1]);
