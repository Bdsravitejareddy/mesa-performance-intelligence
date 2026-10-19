-- This app has one private workspace with explicitly invited, verified accounts.
-- Invite addresses are configured separately and are never public client metadata.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table private.workspace_access (
  email text primary key check (email = lower(trim(email)) and length(email) > 3),
  granted_at timestamptz not null default now()
);
alter table private.workspace_access enable row level security;
revoke all on private.workspace_access from public, anon, authenticated;

-- The definer reads only the server-managed verified email and private invitations.
-- It reveals workspace member IDs only when the caller is a verified member.
create function private.mesa_workspace_member_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select member.id
  from auth.users as member
  join private.workspace_access as invitation on invitation.email = lower(member.email)
  where member.email_confirmed_at is not null
    and exists (
      select 1 from auth.users as caller
      join private.workspace_access as permitted on permitted.email = lower(caller.email)
      where caller.id = (select auth.uid()) and caller.email_confirmed_at is not null
    );
$$;
revoke all on function private.mesa_workspace_member_ids() from public, anon;
grant execute on function private.mesa_workspace_member_ids() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'courses','course_modules','learning_objectives','assessments','course_materials',
    'material_pages','rubrics','rubric_criteria','submissions','evaluation_reports',
    'material_references','evaluation_evidence','topic_competencies','swot_entries',
    'role_profiles','resume_gap_findings','quality_checks','sync_runs'
  ] loop
    execute format('drop policy owner_access on public.%I', table_name);
    execute format(
      'create policy workspace_access on public.%I for all to authenticated using (user_id in (select private.mesa_workspace_member_ids())) with check (user_id in (select private.mesa_workspace_member_ids()))',
      table_name
    );
  end loop;
end;
$$;

drop policy "course files owner select" on storage.objects;
drop policy "course files owner insert" on storage.objects;
drop policy "course files owner update" on storage.objects;
drop policy "course files owner delete" on storage.objects;

create policy "course files workspace select" on storage.objects
for select to authenticated using (
  bucket_id = 'course-files' and (storage.foldername(name))[1] in (select private.mesa_workspace_member_ids()::text)
);
create policy "course files workspace insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'course-files' and (storage.foldername(name))[1] in (select private.mesa_workspace_member_ids()::text)
);
create policy "course files workspace update" on storage.objects
for update to authenticated using (
  bucket_id = 'course-files' and (storage.foldername(name))[1] in (select private.mesa_workspace_member_ids()::text)
) with check (
  bucket_id = 'course-files' and (storage.foldername(name))[1] in (select private.mesa_workspace_member_ids()::text)
);
create policy "course files workspace delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'course-files' and (storage.foldername(name))[1] in (select private.mesa_workspace_member_ids()::text)
);
