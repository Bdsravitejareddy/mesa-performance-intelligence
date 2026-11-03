-- Course materials that look like they contain credentials are quarantined: hidden from every reader (pages, search,
-- AI grading, vision, guests and file downloads) without being deleted. A member can then purge the quarantined
-- text and file; the material row stays as a tombstone so Drive sync does not re-import the same source version.
-- Imported material rows are immutable, so quarantine lives in its own table rather than a column.
create table private.quarantined_materials (
  material_id uuid primary key references public.course_materials(id) on delete cascade,
  reason text not null check (length(reason) between 1 and 300),
  quarantined_at timestamptz not null default now(),
  purged_at timestamptz
);
alter table private.quarantined_materials enable row level security;
revoke all on private.quarantined_materials from public, anon, authenticated;
grant select, update on private.quarantined_materials to service_role;

create function private.is_quarantined_material(p_material_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.quarantined_materials q where q.material_id = p_material_id);
$$;
revoke all on function private.is_quarantined_material(uuid) from public, anon;
grant execute on function private.is_quarantined_material(uuid) to authenticated, service_role;

create function private.is_quarantined_file(p_path text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.course_materials m join private.quarantined_materials q on q.material_id = m.id where m.storage_path = p_path);
$$;
revoke all on function private.is_quarantined_file(text) from public, anon;
grant execute on function private.is_quarantined_file(text) to authenticated, service_role;

-- Signed-in readers (members and guests) never see a quarantined material, its pages or its stored file.
create policy "quarantined materials are hidden" on public.course_materials as restrictive for select to authenticated
using (not private.is_quarantined_material(id));
create policy "quarantined pages are hidden" on public.material_pages as restrictive for select to authenticated
using (not private.is_quarantined_material(material_id));
create policy "quarantined files are hidden" on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'course-files' or not private.is_quarantined_file(name));

-- Background work (service role) reads current materials through this view, so it excludes quarantine too.
create or replace view public.current_course_materials with (security_invoker = true) as
 select material.id, material.name, material.version, material.source_kind,
        material.drive_source_id, material.course_id, material.assessment_id
 from public.course_materials material
 where (material.drive_source_id is null or exists (
   select 1 from public.drive_sources source
   where source.id = material.drive_source_id and source.current_material_id = material.id and source.available))
   and not private.is_quarantined_material(material.id);

-- Credential patterns: Google API keys, OpenAI/Anthropic-style secret keys, GitHub tokens, AWS access keys and
-- PEM private keys. Matching only flags the document; nothing about the match is stored.
create function private.looks_like_secret(p_text text) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_text, '') ~ '(AIza[0-9A-Za-z_-]{35}|sk-(ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{36}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)';
$$;

create function private.quarantine_secret_pages() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.looks_like_secret(new.extracted_text) then
    insert into private.quarantined_materials(material_id, reason) values (new.material_id, 'A page appears to contain an API key, token or private key.') on conflict do nothing;
  end if;
  return null;
end $$;
create trigger quarantine_secret_pages after insert on public.material_pages for each row execute function private.quarantine_secret_pages();

-- Existing materials: any page with a credential pattern, or a file named as holding keys or passwords.
insert into private.quarantined_materials(material_id, reason)
select distinct p.material_id, 'A page appears to contain an API key, token or private key.' from public.material_pages p where private.looks_like_secret(p.extracted_text)
on conflict do nothing;
insert into private.quarantined_materials(material_id, reason)
select m.id, 'The file name suggests it holds API keys, passwords or other credentials.' from public.course_materials m
where m.name ~* '(api[ _-]?keys?|password|credential|private[ _-]?key|access[ _-]?token)'
on conflict do nothing;

-- Imported pages are otherwise immutable; the service role may delete the pages of a quarantined material only.
create or replace function private.drive_immutable_material() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='course_materials' then
  if tg_op in ('INSERT','UPDATE') and new.drive_source_id is not null and current_user<>'service_role' then raise exception 'Import provenance is service-only'; end if;
  if tg_op='INSERT' then return new; end if;
  if old.drive_source_id is not null then raise exception 'Imported material versions are immutable'; end if;
 else
  if tg_op='UPDATE' and exists(select 1 from public.course_materials where id=new.material_id and drive_source_id is not null) then raise exception 'Imported pages are immutable'; end if;
  if tg_op='INSERT' then
   if exists(select 1 from public.course_materials m where m.id=new.material_id and m.drive_source_id is not null) and (current_user<>'service_role' or exists(select 1 from public.drive_import_items where material_id=new.material_id and status='published')) then raise exception 'Imported pages are immutable'; end if;
   return new;
  end if;
  if exists(select 1 from public.course_materials where id=old.material_id and drive_source_id is not null)
     and not (current_user='service_role' and private.is_quarantined_material(old.material_id)) then raise exception 'Imported pages are immutable'; end if;
 end if;
 if tg_op='UPDATE' then return new; end if;
 return old;
end $$;

-- Erases a quarantined material's indexed text (and, by cascade, its notes and reviews) and marks it purged. The
-- stored file is removed by the calling route. Service role only.
create function public.purge_quarantined_material(p_material_id uuid) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare removed integer;
begin
  if not private.is_quarantined_material(p_material_id) then raise exception 'Only a quarantined material can be purged.'; end if;
  delete from public.material_pages where material_id = p_material_id;
  get diagnostics removed = row_count;
  update private.quarantined_materials set purged_at = now() where material_id = p_material_id;
  return jsonb_build_object('pages', removed);
end $$;
revoke all on function public.purge_quarantined_material(uuid) from public, anon, authenticated;
grant execute on function public.purge_quarantined_material(uuid) to service_role;

-- What a member sees in the review list: names and reasons only, never the content.
create function public.quarantined_materials_overview() returns table (material_id uuid, name text, course text, reason text, quarantined_at timestamptz, purged_at timestamptz, storage_path text)
language sql stable security definer set search_path = '' as $$
  select q.material_id, m.name, c.title, q.reason, q.quarantined_at, q.purged_at, m.storage_path
  from private.quarantined_materials q join public.course_materials m on m.id = q.material_id join public.courses c on c.id = m.course_id
  where m.user_id in (select private.mesa_workspace_member_ids())
  order by q.quarantined_at desc;
$$;
revoke all on function public.quarantined_materials_overview() from public, anon;
grant execute on function public.quarantined_materials_overview() to authenticated, service_role;
