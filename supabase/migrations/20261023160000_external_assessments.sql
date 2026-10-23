-- Results the member enters from other personality tools (16Personalities, CliftonStrengths). Self-reported,
-- proprietary instruments: kept as labelled context beside the IPIP questionnaire, never as a measured score.
create table public.external_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('16personalities','cliftonstrengths')),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);
create index external_assessments_recent_idx on public.external_assessments(kind, created_at desc);
alter table public.external_assessments enable row level security;
revoke all on public.external_assessments from public, anon, authenticated;
grant select, insert, delete on public.external_assessments to authenticated;
create policy workspace_access on public.external_assessments for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.external_assessments
for each statement execute function private.bump_workspace_data_version();
