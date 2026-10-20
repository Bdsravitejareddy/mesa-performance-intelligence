-- Remove only the agent-created synthetic document used for live acceptance.
-- No database-generated IDs or real student/course records are targeted.
-- The two immutable-history triggers are restored before the transaction ends;
-- DDL locks prevent other writers from observing the temporary maintenance state.
do $$
declare
  fixture_source uuid;
  fixture_course uuid;
  candidates integer;
begin
  select count(*) into candidates from public.drive_sources
    where metadata->>'name' = 'MESA_SYNC_VERIFICATION_20261020.pdf';
  if candidates = 0 then return; end if;
  if candidates <> 1 then raise exception 'Ambiguous verification fixture'; end if;
  select id, course_id into fixture_source, fixture_course
    from public.drive_sources where metadata->>'name' = 'MESA_SYNC_VERIFICATION_20261020.pdf';
  if not exists (select 1 from public.courses where id=fixture_course
      and title='Mesa Courses' and created_at >= '2026-10-20T04:22:00Z' and created_at < '2026-10-20T04:23:00Z')
    or exists (select 1 from public.course_materials where course_id=fixture_course and drive_source_id is distinct from fixture_source)
    or exists (select 1 from public.assessments where course_id=fixture_course)
    or exists (select 1 from public.course_modules where course_id=fixture_course)
    or exists (select 1 from public.learning_objectives where course_id=fixture_course)
    or exists (select 1 from public.topic_competencies where course_id=fixture_course)
    or exists (select 1 from public.drive_sources where course_id=fixture_course and id<>fixture_source)
    or exists (select 1 from public.drive_folder_mappings where course_id=fixture_course)
    or (select count(*) from public.material_pages p join public.course_materials m on m.id=p.material_id
        where m.drive_source_id=fixture_source
        and position('MESA_SYNC_VERIFICATION_20261020_PAGE_' || p.page_number::text in p.extracted_text)>0) <> 2
  then raise exception 'Verification fixture identity or isolation guard failed'; end if;

  alter table public.course_materials disable trigger immutable_drive_material;
  alter table public.material_pages disable trigger immutable_drive_pages;
  update public.drive_sources set current_material_id=null where id=fixture_source;
  delete from public.drive_import_items where source_id=fixture_source;
  delete from public.course_materials where drive_source_id=fixture_source;
  delete from public.drive_sources where id=fixture_source;
  delete from public.courses where id=fixture_course;
  alter table public.material_pages enable trigger immutable_drive_pages;
  alter table public.course_materials enable trigger immutable_drive_material;
end $$;

