-- Some assessed work does not count toward the course grade (a hackathon, a diagnostic), even when the LMS
-- releases a score for it. The member marks those; their marks stay visible but are left out of standings and
-- averages, and they count as practice-level evidence for competencies. The LMS sync never sets these columns.
alter table public.assessments add column if not exists counts_toward_grade boolean not null default true;
alter table public.assessments add column if not exists grade_note text not null default '' check (length(grade_note) <= 300);
