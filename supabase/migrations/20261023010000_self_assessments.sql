-- Self-administered tests: generated reasoning tests (scored server-side from the stored seed) and the
-- Mini-IPIP questionnaire. Results are inputs with explicit lower reliability than official assessments.
create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('reasoning','personality')),
  version text not null,
  seed bigint,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  check (kind <> 'reasoning' or seed is not null),
  check ((submitted_at is null) = (result is null))
);
create index test_attempts_recent_idx on public.test_attempts(kind, submitted_at desc);
alter table public.test_attempts enable row level security;
revoke all on public.test_attempts from public, anon, authenticated;
grant select, insert, update on public.test_attempts to authenticated;
create policy workspace_access on public.test_attempts for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

-- A submitted attempt is final.
create or replace function private.freeze_submitted_attempt() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.submitted_at is not null then raise exception 'A submitted attempt cannot be changed.' using errcode = '23514'; end if;
  if new.seed is distinct from old.seed or new.kind is distinct from old.kind or new.started_at is distinct from old.started_at then raise exception 'Attempt parameters cannot be changed.' using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.freeze_submitted_attempt() from public, anon, authenticated;
create trigger freeze_submitted_attempt before update on public.test_attempts for each row execute function private.freeze_submitted_attempt();
