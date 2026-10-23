-- A weekly practice set: quiz and trick questions (answer keys stay on the server), a short case task aimed at
-- the member's weakest skill, and everyday conversational prompts. Practice is ungraded and weighted as such.
create table public.weekly_practice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  week_start date not null,
  seed bigint not null,
  focus text not null default '',
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (user_id, week_start)
);
alter table public.weekly_practice enable row level security;
revoke all on public.weekly_practice from public, anon, authenticated;
grant select, insert, update on public.weekly_practice to authenticated;
create policy own_practice on public.weekly_practice for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger bump_workspace_data_version after insert or update or delete on public.weekly_practice
for each statement execute function private.bump_workspace_data_version();
