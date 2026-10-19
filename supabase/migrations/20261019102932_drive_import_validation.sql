-- Import failure metadata is safe workspace inventory data; no bytes or credentials.
alter table public.drive_sources add column parse_failure_count integer not null default 0,
 add column parse_failure_fingerprint text, add column parse_failure_code text;
create or replace function public.drive_sync_publish(p_connection_id uuid,p_item_id uuid,p_pages jsonb,p_object_size bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; i public.drive_import_items; src public.drive_sources; mid uuid; ver integer; p jsonb; begin
 c:=private.drive_connection(p_connection_id);
 select * into i from public.drive_import_items where id=p_item_id and connection_id=c.id for update;
 if not found or i.mapping_revision<>c.mapping_revision then raise exception 'Invalid or stale item'; end if;
 select * into src from public.drive_sources where id=i.source_id for update;
 if not private.drive_owner_allowed(src.course_user_id) or not exists(select 1 from public.drive_folder_mappings where id=src.folder_mapping_id and enabled and connection_id=c.id) then raise exception 'Mapping unavailable'; end if;
 if i.status='published' then return jsonb_build_object('materialId',i.material_id,'version',i.version); end if;
 if i.status<>'leased' or i.lease_expires_at<=now() or not exists(select 1 from public.drive_scans where id=i.scan_id and status='running' and mapping_revision=c.mapping_revision) then raise exception 'Import lease expired'; end if;
 if jsonb_typeof(p_pages) is distinct from 'array' or jsonb_array_length(p_pages)=0 then raise exception 'No extracted pages'; end if;
 if exists(select 1 from jsonb_array_elements(p_pages) as page_row(value) group by page_row.value->>'pageNumber' having count(*)>1) then raise exception 'Duplicate page numbers'; end if;
 ver:=src.version+1;
 insert into public.course_materials(user_id,course_id,name,storage_path,mime_type,file_size,version,extraction_status,drive_source_id,drive_source_version)
 values(src.course_user_id,src.course_id,i.source_snapshot->>'name',i.storage_path,case src.export_format when 'pdf' then 'application/pdf' else 'application/vnd.openxmlformats-officedocument.presentationml.presentation' end,p_object_size,ver,case when not exists(select 1 from jsonb_array_elements(p_pages) q where length(trim(coalesce(q->>'text','')))>0 or exists(select 1 from jsonb_array_elements(coalesce(q->'tables','[]')) tbl(value) cross join lateral jsonb_array_elements(tbl.value) row_values(value) cross join lateral jsonb_array_elements_text(row_values.value) cell(value) where length(trim(cell.value))>0)) or exists(select 1 from jsonb_array_elements(p_pages) q where coalesce((q->>'hasVisuals')::boolean,false)) then 'needs_visual_review' else 'complete' end,src.id,ver) returning id into mid;
 for p in select value from jsonb_array_elements(p_pages) loop
  insert into public.material_pages(user_id,material_id,page_number,extracted_text,table_data,has_visuals)
  values(src.course_user_id,mid,(p->>'pageNumber')::integer,coalesce(p->>'text',''),coalesce(p->'tables','[]'),coalesce((p->>'hasVisuals')::boolean,false));
 end loop;
 update public.drive_sources set parse_failure_count=0,parse_failure_fingerprint=null,parse_failure_code=null,current_material_id=mid,version=ver,fingerprint=i.source_snapshot->>'fingerprint',metadata=i.source_snapshot,available=true where id=src.id;
 update public.drive_import_items set status='published',material_id=mid,version=ver where id=i.id;
 return jsonb_build_object('materialId',mid,'version',ver);
end $$;

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
   return jsonb_build_object('decision','upload','itemId',item.id,'storagePath',item.storage_path,'exportFormat',fmt);
  end if;
  return jsonb_build_object('decision','retry_later');
 end if;
 insert into public.drive_import_items(id,user_id,connection_id,source_id,scan_id,mapping_revision,source_snapshot,storage_path)
 values(iid,c.user_id,c.id,src.id,s.id,c.mapping_revision,p_source,src.course_user_id::text||'/'||src.course_id::text||'/drive/'||iid::text||'.'||fmt) returning * into item;
 return jsonb_build_object('decision','upload','itemId',item.id,'storagePath',item.storage_path,'exportFormat',fmt);
end $$;

create function public.drive_sync_parse_failure(p_connection_id uuid,p_item_id uuid,p_code text) returns void
language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; i public.drive_import_items; begin
 c:=private.drive_connection(p_connection_id);
 select * into i from public.drive_import_items where id=p_item_id and connection_id=c.id for update;
 if not found then raise exception 'Item unavailable'; end if;
 if i.status<>'leased' then return; end if;
 if p_code not in ('parse_pdf','parse_pptx','invalid_signature','invalid_metadata') then raise exception 'Invalid failure code'; end if;
 update public.drive_sources set parse_failure_count=case when parse_failure_fingerprint=i.source_snapshot->>'fingerprint' then parse_failure_count+1 else 1 end,
 parse_failure_fingerprint=i.source_snapshot->>'fingerprint',parse_failure_code=p_code where id=i.source_id and connection_id=c.id;
 update public.drive_import_items set status='expired',last_error=p_code,attempt_count=attempt_count+1 where id=i.id;
 update public.drive_connections set last_error=p_code where id=c.id;
end $$;
create function public.drive_sync_retry_source(p_connection_id uuid,p_source_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; begin
 c:=private.drive_connection(p_connection_id);
 update public.drive_sources set parse_failure_count=0,parse_failure_code=null,parse_failure_fingerprint=null where id=p_source_id and connection_id=c.id;
 if not found then raise exception 'Source unavailable'; end if;
end $$;
revoke all on function public.drive_sync_parse_failure(uuid,uuid,text), public.drive_sync_retry_source(uuid,uuid) from public,anon,authenticated;
grant execute on function public.drive_sync_parse_failure(uuid,uuid,text), public.drive_sync_retry_source(uuid,uuid) to service_role;
