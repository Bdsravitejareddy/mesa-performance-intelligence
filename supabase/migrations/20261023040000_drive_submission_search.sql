-- Finds the student's own submitted work in Drive by LMS assignment title. The LMS connector reports that an
-- assignment was submitted but never returns the submitted link or file, and those copies (mostly Google Sheets
-- and Docs) live outside the mapped course folders. A per-connection 'submissions' root asks the Apps Script to
-- search only files the account owns whose names contain an assignment's distinctive words; every hit passes
-- the same reserve/upload/finalize checks and lands in the LMS course of the assessment it matched.
-- Also: Google Sheets export as .xlsx (previously unsupported). Needs the updated Apps Script (re-pair).
alter table public.drive_connections add column find_submissions boolean not null default true;
alter table public.drive_folder_mappings drop constraint drive_folder_mappings_mode_check;
alter table public.drive_folder_mappings add constraint drive_folder_mappings_mode_check check (mode in ('course','collection','submissions'));
alter table public.drive_folder_mappings add constraint drive_folder_mappings_submissions_shape check (mode <> 'submissions' or (drive_folder_id = 'search:submissions' and course_id is null));

create or replace function public.drive_sync_configure(p_user_id uuid,p_connection_id uuid,p_mappings jsonb,p_label text default '',p_enabled boolean default true) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; m jsonb; cid uuid; cuid uuid; begin
 if not private.drive_owner_allowed(p_user_id) then raise exception 'Owner is not a verified invited member' using errcode='42501'; end if;
 if jsonb_typeof(p_mappings) is distinct from 'array' or jsonb_array_length(p_mappings)=0 or jsonb_array_length(p_mappings)>100 then raise exception 'Configure 1 to 100 mappings'; end if;
 if p_connection_id is null then insert into public.drive_connections(user_id,label,enabled) values(p_user_id,left(p_label,120),p_enabled) returning * into c;
 else
  select * into c from public.drive_connections where id=p_connection_id for update;
  if not found or not private.drive_owner_allowed(c.user_id) then raise exception 'Connection unavailable'; end if;
  update public.drive_connections set enabled=p_enabled,label=left(p_label,120),mapping_revision=mapping_revision+1,last_error=null where id=c.id returning * into c;
  update public.drive_import_items set status='expired' where connection_id=c.id and status='leased';
  update public.drive_scans set status='superseded' where connection_id=c.id and status='running';
 end if;
 if not p_enabled then delete from private.drive_credentials where connection_id=c.id; end if;
 update public.drive_folder_mappings set enabled=false where connection_id=c.id;
 for m in select value from jsonb_array_elements(p_mappings) loop
   cid:=null; cuid:=null;
   if coalesce(m->>'mode','') not in ('course','collection') then raise exception 'Invalid mapping mode'; end if;
   if m->>'mode'='course' then
    if nullif(m->>'courseId','') is not null then
      select id,user_id into cid,cuid from public.courses where id=(m->>'courseId')::uuid;
      if not found or not private.drive_owner_allowed(cuid) then raise exception 'Course unavailable'; end if;
    else
      select course_id,course_user_id into cid,cuid from public.drive_folder_mappings where connection_id=c.id and drive_folder_id=m->>'driveFolderId' and mode='course';
      if not found then insert into public.courses(user_id,title) values(c.user_id,m->>'rootCourseTitle') returning id,user_id into cid,cuid;
      elsif not private.drive_owner_allowed(cuid) then raise exception 'Course unavailable'; end if;
    end if;
   end if;
   insert into public.drive_folder_mappings(connection_id,user_id,drive_folder_id,mode,course_id,course_user_id,root_course_title,resource_key)
    values(c.id,c.user_id,m->>'driveFolderId',m->>'mode',cid,cuid,m->>'rootCourseTitle',m->>'resourceKey')
    on conflict(connection_id,drive_folder_id) do update set enabled=true,mode=excluded.mode,course_id=excluded.course_id,course_user_id=excluded.course_user_id,root_course_title=excluded.root_course_title,resource_key=excluded.resource_key;
 end loop;
 -- The submitted-work title search is a connection setting, re-added whenever folders are edited.
 if c.find_submissions then
  insert into public.drive_folder_mappings(connection_id,user_id,drive_folder_id,mode,root_course_title)
   values(c.id,c.user_id,'search:submissions','submissions','Submitted work')
   on conflict(connection_id,drive_folder_id) do update set enabled=true,mode='submissions',course_id=null,course_user_id=null;
 end if;
 return jsonb_build_object('id',c.id,'userId',c.user_id,'enabled',c.enabled,'label',c.label,'mappingRevision',c.mapping_revision,'mappings',(select jsonb_agg(jsonb_build_object('id',id,'driveFolderId',drive_folder_id,'mode',mode,'courseId',course_id,'rootCourseTitle',root_course_title,'resourceKey',resource_key)) from public.drive_folder_mappings where connection_id=c.id and enabled));
end $$;

create or replace function public.drive_sync_reserve(p_connection_id uuid,p_scan_id uuid,p_source jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; s public.drive_scans; m public.drive_folder_mappings; src public.drive_sources; item public.drive_import_items; fmt text; cid uuid; cuid uuid; iid uuid:=gen_random_uuid(); begin
 c:=private.drive_connection(p_connection_id);
 select * into s from public.drive_scans where id=p_scan_id and connection_id=c.id and status='running' and mapping_revision=c.mapping_revision;
 if not found then raise exception 'Stale or invalid scan'; end if;
 select * into m from public.drive_folder_mappings where id=(p_source->>'folderMappingId')::uuid and connection_id=c.id and enabled;
 if not found or m.id=any(s.completed_root_ids) then raise exception 'Invalid or completed mapping'; end if;
 if coalesce(length(trim(p_source->>'driveFileId')),0)=0 or coalesce(length(p_source->>'fingerprint'),0)=0 or coalesce(length(trim(p_source->>'name')),0)=0 or coalesce(length(p_source->>'courseFolderId'),0)=0 then raise exception 'Incomplete source'; end if;
 fmt:=case p_source->>'mimeType' when 'application/pdf' then 'pdf' when 'application/vnd.google-apps.document' then 'pdf' when 'application/vnd.google-apps.presentation' then 'pptx' when 'application/vnd.google-apps.spreadsheet' then 'xlsx' when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx' when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx' when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx' else 'unsupported' end;
 select * into src from public.drive_sources where drive_file_id=p_source->>'driveFileId' and export_format=fmt for update;
 if found then
  if src.connection_id<>c.id or src.folder_mapping_id<>m.id or src.course_folder_id<>p_source->>'courseFolderId' or (m.mode='course' and src.course_id<>m.course_id) then return jsonb_build_object('decision','conflict'); end if;
 else
  if m.mode='course' then cid:=m.course_id; cuid:=m.course_user_id;
  elsif m.mode='submissions' then
   -- A title-search hit names the LMS course of the assessment it matched; it must be a workspace course.
   select id,user_id into cid,cuid from public.courses where id=(p_source->>'courseFolderId')::uuid;
   if not found then raise exception 'Invalid course'; end if;
  else
   select d.course_id,d.course_user_id into cid,cuid from public.drive_sources d where d.folder_mapping_id=m.id and d.course_folder_id=p_source->>'courseFolderId' limit 1;
   if not found then insert into public.courses(user_id,title) values(c.user_id,p_source->>'courseFolderTitle') returning id,user_id into cid,cuid; end if;
  end if;
  insert into public.drive_sources(connection_id,user_id,folder_mapping_id,drive_file_id,export_format,course_id,course_user_id,course_folder_id,metadata)
   values(c.id,c.user_id,m.id,p_source->>'driveFileId',fmt,cid,cuid,p_source->>'courseFolderId',p_source) on conflict(drive_file_id,export_format) do nothing returning * into src;
  if not found then return jsonb_build_object('decision','conflict'); end if;
 end if;
 if not private.drive_owner_allowed(src.course_user_id) then raise exception 'Course owner unavailable'; end if;
 update public.drive_sources set last_seen_scan_id=s.id where id=src.id;
 if fmt='unsupported' then update public.drive_sources set metadata=p_source where id=src.id; return jsonb_build_object('decision','unsupported'); end if;
 if src.current_material_id is not null and src.fingerprint=p_source->>'fingerprint' then
  update public.drive_sources set available=true where id=src.id;
  return jsonb_build_object('decision','unchanged'); end if;
 if src.parse_failure_fingerprint is distinct from p_source->>'fingerprint' then
  update public.drive_sources set parse_failure_count=0,parse_failure_code=null,parse_failure_fingerprint=null where id=src.id;
 elsif src.parse_failure_count>=3 then return jsonb_build_object('decision','unsupported','reason','Automatic retries paused after three parse failures; retry from the dashboard.'); end if;
 update public.drive_import_items set status='expired' where source_id=src.id and status='leased' and lease_expires_at<=now();
 select * into item from public.drive_import_items where source_id=src.id and status='leased';
 if found then
  if item.connection_id=c.id and item.scan_id=s.id and item.mapping_revision=c.mapping_revision and item.source_snapshot->>'fingerprint'=p_source->>'fingerprint' then
   update public.drive_import_items set lease_expires_at=now()+interval '5 minutes' where id=item.id;
   return jsonb_build_object('decision','upload','itemId',item.id,'storagePath',item.storage_path,'exportFormat',fmt);
  end if;
  return jsonb_build_object('decision','retry_later');
 end if;
 insert into public.drive_import_items(id,user_id,connection_id,source_id,scan_id,mapping_revision,source_snapshot,storage_path)
 values(iid,c.user_id,c.id,src.id,s.id,c.mapping_revision,p_source,src.course_user_id::text||'/'||src.course_id::text||'/drive/'||iid::text||'.'||fmt) returning * into item;
 return jsonb_build_object('decision','upload','itemId',item.id,'storagePath',item.storage_path,'exportFormat',fmt);
end $$;

-- Enable the search on existing connections; a mapping change supersedes any running scan, as configure does.
do $$
declare c record;
begin
  for c in select id, user_id from public.drive_connections where enabled and find_submissions loop
    insert into public.drive_folder_mappings(connection_id,user_id,drive_folder_id,mode,root_course_title)
      values(c.id,c.user_id,'search:submissions','submissions','Submitted work')
      on conflict(connection_id,drive_folder_id) do update set enabled=true,mode='submissions';
    update public.drive_connections set mapping_revision=mapping_revision+1 where id=c.id;
    update public.drive_import_items set status='expired' where connection_id=c.id and status='leased';
    update public.drive_scans set status='superseded' where connection_id=c.id and status='running';
  end loop;
end $$;
