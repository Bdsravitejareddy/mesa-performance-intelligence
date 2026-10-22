-- Development actions the member chose from the roadmap. Each keeps the competency's state and evidence
-- fingerprint at the start, so outcomes are judged only from evidence recorded afterwards.
create table public.roadmap_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competency_id text not null references public.competencies(id),
  activity text not null check (length(trim(activity)) between 1 and 400),
  activity_kind text not null check (activity_kind in ('validate','close_gap','build_proof','broaden','resolve_conflict')),
  rationale text not null default '' check (length(rationale) <= 1000),
  priority numeric(6,2) not null default 0,
  effort_hours numeric(5,1) not null default 0 check (effort_hours >= 0),
  status text not null default 'planned' check (status in ('planned','in_progress','done','dropped')),
  start_state text not null,
  start_evidence_fingerprint text not null check (length(start_evidence_fingerprint) = 64),
  outcome text check (outcome in ('improved','unchanged','worse','no_new_evidence')),
  outcome_checked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'done') = (completed_at is not null))
);
create index roadmap_actions_competency_idx on public.roadmap_actions(competency_id, status);
alter table public.roadmap_actions enable row level security;
revoke all on public.roadmap_actions from public, anon, authenticated;
grant select, insert, update on public.roadmap_actions to authenticated;
create policy workspace_access on public.roadmap_actions for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
