-- Why a week fell back to reasoning questions, so the page can say so.
alter table public.weekly_practice add column if not exists note text not null default '';
