-- Why this week's practice targets the competency it does.
alter table public.weekly_practice add column if not exists focus_reason text not null default '';
