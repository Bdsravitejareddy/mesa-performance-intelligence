-- A single counter that changes whenever workspace data changes. Pages read it (one tiny query) and reuse
-- cached results while it is unchanged, so caching never serves stale data and needs no manual invalidation.
create table public.workspace_data_version (
  id integer primary key default 1 check (id = 1),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.workspace_data_version (id) values (1);
alter table public.workspace_data_version enable row level security;
revoke all on public.workspace_data_version from public, anon, authenticated;
grant select on public.workspace_data_version to authenticated;
create policy members_read on public.workspace_data_version for select to authenticated
using ((select auth.uid()) in (select private.mesa_workspace_member_ids()));

create or replace function private.bump_workspace_data_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.workspace_data_version set version = version + 1, updated_at = now() where id = 1;
  return null;
end $$;
revoke all on function private.bump_workspace_data_version() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'courses','assessments','submissions','course_materials','material_pages','rubrics','rubric_criteria',
    'evaluation_reports','evaluation_evidence','topic_competencies','swot_entries','role_profiles','role_evidence_findings',
    'quality_checks','sync_runs','assessment_competencies','course_links','competency_snapshots','competency_challenges',
    'material_page_notes','material_reviews','lms_unassigned_assignments','material_submission_matches','submission_documents',
    'professional_evidence','professional_claims','roadmap_actions','behaviour_analyses','conversation_imports','test_attempts',
    'drive_sources','drive_scans'
  ] loop
    execute format('create trigger bump_workspace_data_version after insert or update or delete on public.%I for each statement execute function private.bump_workspace_data_version()', t);
  end loop;
end $$;
