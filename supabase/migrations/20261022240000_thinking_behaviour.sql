-- Optional, consented AI-conversation imports. Only the member's own messages are kept as evidence;
-- assistant replies are discarded at import because an assistant's opinion is not evidence of ability.
create table public.conversation_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('chatgpt','claude','gemini','other')),
  title text not null check (length(trim(title)) between 1 and 200),
  consent_statement text not null check (length(trim(consent_statement)) > 0),
  user_messages jsonb not null check (jsonb_typeof(user_messages) = 'array'),
  message_count integer not null check (message_count >= 0),
  conversation_count integer not null check (conversation_count >= 0),
  created_at timestamptz not null default now()
);
alter table public.conversation_imports enable row level security;
revoke all on public.conversation_imports from public, anon, authenticated;
grant select, insert, delete on public.conversation_imports to authenticated;
-- Conversations are personal: only the importing account can see or delete them.
create policy own_imports on public.conversation_imports for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Each analysis run is kept; a new run never overwrites an earlier one.
create table public.behaviour_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dimensions jsonb not null check (jsonb_typeof(dimensions) = 'array'),
  source_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(source_counts) = 'object'),
  input_hash text not null check (length(input_hash) = 64),
  provider_model text not null default '',
  included_conversations boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.behaviour_analyses enable row level security;
revoke all on public.behaviour_analyses from public, anon, authenticated;
grant select, insert on public.behaviour_analyses to authenticated;
create policy own_analyses on public.behaviour_analyses for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
