-- Root resource keys are source link metadata, visible only to verified workspace members.
alter table public.drive_folder_mappings add column resource_key text check(resource_key is null or resource_key ~ '^[A-Za-z0-9_-]{1,200}$');

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
 return jsonb_build_object('id',c.id,'userId',c.user_id,'enabled',c.enabled,'label',c.label,'mappingRevision',c.mapping_revision,'mappings',(select jsonb_agg(jsonb_build_object('id',id,'driveFolderId',drive_folder_id,'mode',mode,'courseId',course_id,'rootCourseTitle',root_course_title,'resourceKey',resource_key)) from public.drive_folder_mappings where connection_id=c.id and enabled));
end $$;

create or replace function public.drive_sync_start_scan(p_connection_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; s public.drive_scans; begin
 c:=private.drive_connection(p_connection_id);
 select * into s from public.drive_scans where connection_id=c.id and status='running';
 if not found then insert into public.drive_scans(connection_id,user_id,mapping_revision) values(c.id,c.user_id,c.mapping_revision) returning * into s; end if;
 return jsonb_build_object('scanId',s.id,'checkpoint',s.checkpoint,'mappings',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'driveFolderId',drive_folder_id,'mode',mode,'courseId',course_id,'rootCourseTitle',root_course_title,'resourceKey',resource_key)),'[]') from public.drive_folder_mappings where connection_id=c.id and enabled));
end $$;

-- Service only. Callers first resolve accessible connection IDs through session RLS.
-- This function only reads; polling cannot start/resume a scan or expose stored hashes.
create function public.drive_sync_status(p_connection_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'paired',exists(select 1 from private.drive_credentials cr where cr.connection_id=c.id and cr.token_hash is not null),
  'lastSuccessfulScanAt',(select max(s.completed_at) from public.drive_scans s where s.connection_id=c.id and s.status='complete'),
  'latestScan',(select jsonb_build_object('id',s.id,'status',s.status,'startedAt',s.created_at,'completedAt',s.completed_at,
     'partial',exists(select 1 from jsonb_each(s.checkpoint->'roots') r where coalesce((r.value->>'failed')::boolean,false)),
     'completedRoots',cardinality(s.completed_root_ids),
     'imported',(select count(*) from public.drive_import_items i where i.scan_id=s.id and i.status='published'),
     'unchanged',(select count(*) from public.drive_sources d where d.connection_id=c.id and d.last_seen_scan_id=s.id and d.current_material_id is not null and not exists(select 1 from public.drive_import_items i where i.scan_id=s.id and i.source_id=d.id and i.status='published'))
   ) from public.drive_scans s where s.connection_id=c.id order by s.created_at desc,s.id limit 1),
  'counts',(select jsonb_build_object('total',count(*),'indexed',count(*) filter(where d.current_material_id is not null),
     'unsupported',count(*) filter(where d.export_format='unsupported'),'failed',count(*) filter(where d.parse_failure_count>0),
     'unavailable',count(*) filter(where not d.available and d.current_material_id is not null)) from public.drive_sources d where d.connection_id=c.id),
  'sources',(select coalesce(jsonb_agg(v.value),'[]') from (
    select jsonb_build_object('id',d.id,'driveFileId',d.drive_file_id,'name',left(d.metadata->>'name',500),
      'sourceUrl',d.metadata->>'sourceUrl','courseId',d.course_id,'exportFormat',d.export_format,
      'available',d.available,'version',d.version,'failureCount',d.parse_failure_count,'failureCode',d.parse_failure_code,
      'extractionStatus',m.extraction_status) value
    from public.drive_sources d left join public.course_materials m on m.id=d.current_material_id
    where d.connection_id=c.id order by (d.parse_failure_count>0) desc, (not d.available) desc, d.id limit 100
  ) v)
 )),'[]') from public.drive_connections c where c.id=any(p_connection_ids) and private.drive_owner_allowed(c.user_id)
$$;
revoke all on function public.drive_sync_status(uuid[]) from public,anon,authenticated;
grant execute on function public.drive_sync_status(uuid[]) to service_role;
