-- A gamified weekly plan: up to five tasks per ISO week, suggested from the roadmap and overview summary or
-- written by the member, ticked off for points and streaks. Personal to the account that owns them.
create table public.weekly_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  week_start date not null,
  title text not null check (length(trim(title)) between 1 and 200),
  source text not null default 'self' check (source in ('self','suggested')),
  reason text not null default '' check (length(reason) <= 400),
  position smallint not null default 0 check (position between 0 and 9),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index weekly_tasks_week_idx on public.weekly_tasks(user_id, week_start);
alter table public.weekly_tasks enable row level security;
revoke all on public.weekly_tasks from public, anon, authenticated;
grant select, insert, update, delete on public.weekly_tasks to authenticated;
create policy own_tasks on public.weekly_tasks for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Five tasks per week at most.
create or replace function private.limit_weekly_tasks() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.weekly_tasks where user_id = new.user_id and week_start = new.week_start) >= 5 then
    raise exception 'A week holds at most five tasks.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger weekly_tasks_limit before insert on public.weekly_tasks for each row execute function private.limit_weekly_tasks();

-- How a course is assessed when it is not by ordinary marks, e.g. through the Mesa Readiness Score (MRS),
-- with when results are expected and the observed cohort ceiling used to read a score fairly.
create table public.course_context (
  course_id uuid primary key references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assessed_by text not null default '' check (length(assessed_by) <= 60),
  expected text not null default '' check (length(expected) <= 60),
  scale_max numeric(5,2) check (scale_max is null or scale_max between 1 and 100),
  note text not null default '' check (length(note) <= 400),
  updated_at timestamptz not null default now()
);
alter table public.course_context enable row level security;
revoke all on public.course_context from public, anon, authenticated;
grant select, insert, update, delete on public.course_context to authenticated;
create policy workspace_access on public.course_context for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

-- As told by the member (2026-10-23): these two courses are assessed through MRS, results due in November;
-- MRS measures first-principles thinking and problem-solving, and the cohort's highest score is 79.
insert into public.course_context(course_id, user_id, assessed_by, expected, scale_max, note)
select id, user_id, 'MRS', 'November 2026', 79, 'Mesa Readiness Score: first-principles thinking and problem-solving; cohort high 79.'
from public.courses where title ilike 'AI and its Application%' or title ilike 'Power of Communication%'
on conflict (course_id) do nothing;
