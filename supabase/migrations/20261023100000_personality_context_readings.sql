-- A personality reading inferred from the member's written context (their questionnaire note, assistant
-- profiles and observed behaviour), shown beside the self-report and never replacing it. Personal, like the
-- assistant profiles it draws on: only the account it belongs to can see it.
create table public.personality_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  factors jsonb not null check (jsonb_typeof(factors) = 'object'),
  summary text not null default '' check (length(summary) <= 2000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  provider_model text not null default '',
  created_at timestamptz not null default now()
);
create index personality_readings_recent_idx on public.personality_readings(user_id, created_at desc);
alter table public.personality_readings enable row level security;
revoke all on public.personality_readings from public, anon, authenticated;
grant select, insert, delete on public.personality_readings to authenticated;
create policy own_readings on public.personality_readings for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger bump_workspace_data_version after insert or update or delete on public.personality_readings
for each statement execute function private.bump_workspace_data_version();
