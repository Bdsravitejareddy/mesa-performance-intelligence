-- Append-only history of competency conclusions. A new row is written only when a conclusion, its evidence,
-- its mappings or the classification rules change; earlier rows are never edited or deleted by members.
create table public.competency_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competency_id text not null references public.competencies(id),
  state text not null check (state in ('demonstrated_strength','emerging','meets_expectations','development_area','conflicting','insufficient_evidence')),
  confidence text not null check (confidence in ('high','medium','low','insufficient')),
  headline text not null default '' check (length(headline) <= 300),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  scored_count integer not null default 0 check (scored_count >= 0),
  evidence_fingerprint text not null check (length(evidence_fingerprint) = 64),
  mapping_fingerprint text not null check (length(mapping_fingerprint) = 64),
  rules_version text not null check (length(trim(rules_version)) > 0),
  reason text not null check (reason in ('initial','evidence_changed','mapping_changed','rules_changed')),
  recorded_at timestamptz not null default now()
);
create index competency_snapshots_lookup_idx on public.competency_snapshots(competency_id, recorded_at desc);
alter table public.competency_snapshots enable row level security;
revoke all on public.competency_snapshots from public, anon, authenticated;
grant select, insert on public.competency_snapshots to authenticated;
create policy workspace_access on public.competency_snapshots
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

-- A member can dispute a conclusion and attach counterevidence. Challenges are kept, never silently removed.
create table public.competency_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competency_id text not null references public.competencies(id),
  disputed_state text not null check (disputed_state in ('demonstrated_strength','emerging','meets_expectations','development_area','conflicting','insufficient_evidence')),
  statement text not null check (length(trim(statement)) between 1 and 2000),
  counterevidence text not null default '' check (length(counterevidence) <= 4000),
  status text not null default 'open' check (status in ('open','resolved','withdrawn')),
  resolution_note text not null default '' check (length(resolution_note) <= 2000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'open') = (resolved_at is null)),
  check (status <> 'resolved' or length(trim(resolution_note)) > 0)
);
create index competency_challenges_competency_idx on public.competency_challenges(competency_id, created_at desc);
alter table public.competency_challenges enable row level security;
revoke all on public.competency_challenges from public, anon, authenticated;
grant select, insert, update on public.competency_challenges to authenticated;
create policy workspace_access on public.competency_challenges
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

-- Only the status, resolution note and resolution time may change after a challenge is filed.
create or replace function private.protect_competency_challenge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.competency_id is distinct from old.competency_id or new.disputed_state is distinct from old.disputed_state
     or new.statement is distinct from old.statement or new.counterevidence is distinct from old.counterevidence
     or new.user_id is distinct from old.user_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'A filed challenge cannot be rewritten; file a new one instead.' using errcode = '23514';
  end if;
  if old.status <> 'open' then
    raise exception 'A closed challenge cannot be reopened or edited.' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.protect_competency_challenge() from public, anon, authenticated;
create trigger protect_competency_challenge before update on public.competency_challenges
for each row execute function private.protect_competency_challenge();
