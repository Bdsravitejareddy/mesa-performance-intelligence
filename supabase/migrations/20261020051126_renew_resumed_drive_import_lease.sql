-- Resumed uploads need a full lease, even when their existing lease is nearly expired.
-- The source row lock and existing ownership checks protect same-item reuse.
create or replace function public.drive_sync_reserve(p_connection_id uuid,p_scan_id uuid,p_source jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; s public.drive_scans; m public.drive_folder_mappings; src public.drive_sources; item public.drive_import_items; fmt text; cid uuid; cuid uuid; iid uuid:=gen_random_uuid(); begin
 c:=private.drive_connection(p_connection_id);
 select * into s from public.drive_scans where id=p_scan_id and connection_id=c.id and status='running' and mapping_revision=c.mapping_revision;
 if not found then raise exception 'Stale or invalid scan'; end if;
 select * into m from public.drive_folder_mappings where id=(p_source->>'folderMappingId')::uuid and connection_id=c.id and enabled;
 if not found or m.id=any(s.completed_root_ids) then raise exception 'Invalid or completed mapping'; end if;
 if coalesce(length(trim(p_source->>'driveFileId')),0)=0 or coalesce(length(p_source->>'fingerprint'),0)=0 or coalesce(length(trim(p_source->>'name')),0)=0 or coalesce(length(p_source->>'courseFolderId'),0)=0 then raise exception 'Incomplete source'; end if;
 fmt:=case p_source->>'mimeType' when 'application/pdf' then 'pdf' when 'application/vnd.google-apps.document' then 'pdf' when 'application/vnd.google-apps.presentation' then 'pptx' when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx' else 'unsupported' end;
 select * into src from public.drive_sources where drive_file_id=p_source->>'driveFileId' and export_format=fmt for update;
 if found then
  if src.connection_id<>c.id or src.folder_mapping_id<>m.id or src.course_folder_id<>p_source->>'courseFolderId' or (m.mode='course' and src.course_id<>m.course_id) then return jsonb_build_object('decision','conflict'); end if;
 else
  if m.mode='course' then cid:=m.course_id; cuid:=m.course_user_id;
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
