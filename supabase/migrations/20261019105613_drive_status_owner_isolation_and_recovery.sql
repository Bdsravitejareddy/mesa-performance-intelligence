-- Remember errors across separate checkpoint requests. Only a later complete,
-- clean scan may clear an older connection error. Preserve errors on in-flight
-- scans that predate this flag rather than guessing when their error occurred.
alter table public.drive_scans add column had_errors boolean not null default false;
update public.drive_scans s set had_errors=true
 where s.status='running' and exists(select 1 from public.drive_connections c where c.id=s.connection_id and c.last_error is not null);

create or replace function public.drive_sync_record_error(p_connection_id uuid,p_message text,p_item_id uuid default null) returns void language plpgsql security invoker set search_path='' as $$
begin perform private.drive_connection(p_connection_id);
 if p_item_id is not null then
  update public.drive_import_items set status=case when status='leased' then 'expired' else status end,last_error=left(p_message,1000),attempt_count=attempt_count+1 where id=p_item_id and connection_id=p_connection_id;
  if not found then raise exception 'Item unavailable'; end if;
 end if;
 update public.drive_scans set had_errors=true where connection_id=p_connection_id and status='running';
 update public.drive_connections set last_error=left(p_message,1000) where id=p_connection_id;
end $$;

create or replace function public.drive_sync_parse_failure(p_connection_id uuid,p_item_id uuid,p_code text) returns void
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
 update public.drive_scans set had_errors=true where id=i.scan_id and connection_id=c.id and status='running';
 update public.drive_connections set last_error=p_code where id=c.id;
end $$;
create or replace function public.drive_sync_checkpoint(p_connection_id uuid,p_scan_id uuid,p_value jsonb,p_completed_root_ids jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; s public.drive_scans; roots uuid[]; rid uuid; begin
 c:=private.drive_connection(p_connection_id);
 select * into s from public.drive_scans where id=p_scan_id and connection_id=c.id and status='running' and mapping_revision=c.mapping_revision for update;
 if not found then raise exception 'Invalid or stale scan'; end if;
 if octet_length(p_value::text)>262144 then raise exception 'Checkpoint capacity exceeded (256 KiB)'; end if;
 if jsonb_typeof(p_value) is distinct from 'object' or jsonb_typeof(p_value->'roots') is distinct from 'object' then raise exception 'Invalid checkpoint'; end if;
 if jsonb_typeof(p_completed_root_ids) is distinct from 'array' or jsonb_array_length(p_completed_root_ids)>100 then raise exception 'Checkpoint batch capacity exceeded (100 roots)'; end if;
 select coalesce(array_agg(value::uuid),'{}') into roots from jsonb_array_elements_text(p_completed_root_ids);
 foreach rid in array roots loop
  if coalesce((p_value->'roots'->rid::text->>'failed')::boolean,false) then raise exception 'Failed roots cannot complete'; end if;
  if not exists(select 1 from public.drive_folder_mappings where id=rid and connection_id=c.id and enabled) then raise exception 'Invalid completed root'; end if;
  if exists(select 1 from public.drive_import_items i join public.drive_sources d on d.id=i.source_id where i.scan_id=s.id and d.folder_mapping_id=rid and i.status='leased') then raise exception 'Root has outstanding imports'; end if;
  update public.drive_sources set available=(last_seen_scan_id is not distinct from s.id) where folder_mapping_id=rid;
 end loop;
 select array_agg(distinct x) into roots from unnest(s.completed_root_ids||roots) x;
 update public.drive_scans set checkpoint=p_value,completed_root_ids=coalesce(roots,'{}'),status=case when not exists(select 1 from public.drive_folder_mappings where connection_id=c.id and enabled and not(id=any(coalesce(roots,'{}'))) and not (coalesce((p_value->'roots'->id::text->>'failed')::boolean,false) and coalesce(jsonb_array_length(p_value->'roots'->id::text->'pendingFolders'),0)=0 and coalesce(jsonb_array_length(p_value->'roots'->id::text->'pendingFiles'),0)=0)) then case when exists(select 1 from jsonb_each(p_value->'roots') r where coalesce((r.value->>'failed')::boolean,false)) then 'failed' else 'complete' end else 'running' end where id=s.id;
 update public.drive_scans set completed_at=now() where id=s.id and status in ('complete','failed');
 update public.drive_connections set last_scan_at=now(),last_error=case
  when exists(select 1 from public.drive_scans where id=s.id and status='failed') then 'One or more Drive roots failed'
  when exists(select 1 from public.drive_scans where id=s.id and status='complete' and not had_errors)
   and not exists(select 1 from public.drive_sources d where d.connection_id=c.id and d.last_seen_scan_id=s.id and d.parse_failure_count>0)
   and not exists(select 1 from public.drive_import_items i where i.scan_id=s.id and i.status<>'published') then null
  else last_error end where id=c.id;
end $$;

-- All inventory metadata and aggregates independently enforce course-owner access.
create or replace function public.drive_sync_status(p_connection_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'paired',exists(select 1 from private.drive_credentials cr where cr.connection_id=c.id and cr.token_hash is not null),
  'lastSuccessfulScanAt',(select max(s.completed_at) from public.drive_scans s where s.connection_id=c.id and s.status='complete'),
  'latestScan',(select jsonb_build_object('id',s.id,'status',s.status,'startedAt',s.created_at,'completedAt',s.completed_at,
     'partial',exists(select 1 from jsonb_each(s.checkpoint->'roots') r where coalesce((r.value->>'failed')::boolean,false)),
     'completedRoots',cardinality(s.completed_root_ids),
     'imported',(select count(*) from public.drive_import_items i join public.drive_sources d on d.id=i.source_id where i.scan_id=s.id and i.status='published' and private.drive_owner_allowed(d.course_user_id)),
     'unchanged',(select count(*) from public.drive_sources d where d.connection_id=c.id
       and private.drive_owner_allowed(d.course_user_id) and d.last_seen_scan_id=s.id
       and d.current_material_id is not null and d.available and d.parse_failure_count=0
       -- A current material is only the previous good version while an update is
       -- leased, failed, retry-gated, or waiting on another scan's lease.
       and not exists(select 1 from public.drive_import_items i where i.source_id=d.id and (i.scan_id=s.id or i.status='leased')))
   ) from public.drive_scans s where s.connection_id=c.id order by s.created_at desc,s.id limit 1),
  'counts',(select jsonb_build_object('total',count(*),'indexed',count(*) filter(where d.current_material_id is not null),
     'unsupported',count(*) filter(where d.export_format='unsupported'),'failed',count(*) filter(where d.parse_failure_count>0),
     'unavailable',count(*) filter(where not d.available and d.current_material_id is not null)) from public.drive_sources d where d.connection_id=c.id and private.drive_owner_allowed(d.course_user_id)),
  'sources',(select coalesce(jsonb_agg(v.value),'[]') from (
    select jsonb_build_object('id',d.id,'driveFileId',d.drive_file_id,'name',left(d.metadata->>'name',500),
      'sourceUrl',d.metadata->>'sourceUrl','courseId',d.course_id,'exportFormat',d.export_format,
      'available',d.available,'version',d.version,'failureCount',d.parse_failure_count,'failureCode',d.parse_failure_code,
      'extractionStatus',m.extraction_status) value
    from public.drive_sources d left join public.course_materials m on m.id=d.current_material_id
    where d.connection_id=c.id and private.drive_owner_allowed(d.course_user_id) order by (d.parse_failure_count>0) desc, (not d.available) desc, d.id limit 100
  ) v)
 )),'[]') from public.drive_connections c where c.id=any(p_connection_ids) and private.drive_owner_allowed(c.user_id)
$$;
revoke all on function public.drive_sync_status(uuid[]) from public,anon,authenticated;
grant execute on function public.drive_sync_status(uuid[]) to service_role;
