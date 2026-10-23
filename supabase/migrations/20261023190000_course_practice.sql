-- Course-grounded, timed weekly practice: the generated questions are stored with the set; their answer keys
-- live in a separate table that only the server (service role) can read.
alter table public.weekly_practice add column if not exists items jsonb;
alter table public.weekly_practice add column if not exists course_title text not null default '';
alter table public.weekly_practice add column if not exists time_limit_seconds integer not null default 1500 check (time_limit_seconds between 60 and 7200);
create table public.weekly_practice_keys (
  practice_id uuid primary key references public.weekly_practice(id) on delete cascade,
  key jsonb not null check (jsonb_typeof(key) = 'object'),
  explanations jsonb not null default '{}'::jsonb check (jsonb_typeof(explanations) = 'object')
);
alter table public.weekly_practice_keys enable row level security;
revoke all on public.weekly_practice_keys from public, anon, authenticated;
