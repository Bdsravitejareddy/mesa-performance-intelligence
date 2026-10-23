-- The practice timer starts when the member presses Start, not when the set is prepared.
alter table public.weekly_practice add column if not exists started_at timestamptz;
