-- Traversal acknowledgements and terminal-item lease expiry share one transaction.
-- A capacity/validation failure or interruption preserves both the previous queue
-- and the old lease; successful completion cannot leave a hidden outstanding item.
create function public.drive_sync_checkpoint_with_errors(
 p_connection_id uuid,p_scan_id uuid,p_value jsonb,p_completed_root_ids jsonb,p_errors jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; failure jsonb; item_id uuid;
begin
 c:=private.drive_connection(p_connection_id);
 if octet_length(p_value::text)>262144 then raise exception 'Checkpoint capacity exceeded (256 KiB)'; end if;
 if jsonb_typeof(p_errors) is distinct from 'array' or jsonb_array_length(p_errors)>100 then raise exception 'Invalid scan errors'; end if;
 if not exists(select 1 from public.drive_scans where id=p_scan_id and connection_id=c.id and status='running' and mapping_revision=c.mapping_revision) then raise exception 'Invalid or stale scan'; end if;
 -- Validate every error before any item mutation, including the item scan fence.
 for failure in select value from jsonb_array_elements(p_errors) loop
  if jsonb_typeof(failure) is distinct from 'object' or jsonb_typeof(failure->'message') is distinct from 'string' or length(failure->>'message')>1000 then raise exception 'Invalid scan error'; end if;
  if failure ? 'itemId' then
   if jsonb_typeof(failure->'itemId') is distinct from 'string' then raise exception 'Invalid error item'; end if;
   item_id:=(failure->>'itemId')::uuid;
   if not exists(select 1 from public.drive_import_items where id=item_id and connection_id=c.id and scan_id=p_scan_id) then raise exception 'Error item is outside this connection and scan'; end if;
  end if;
 end loop;
 for failure in select value from jsonb_array_elements(p_errors) loop
  perform public.drive_sync_record_error(c.id,failure->>'message',(failure->>'itemId')::uuid);
 end loop;
 perform public.drive_sync_checkpoint(c.id,p_scan_id,p_value,p_completed_root_ids);
end $$;
revoke all on function public.drive_sync_checkpoint_with_errors(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.drive_sync_checkpoint_with_errors(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

-- Apply source currency before PostgREST's row limit. Historical records remain
-- readable through course_materials/material_pages for saved citations.
create view public.current_course_materials with (security_invoker=true) as
 select material.id,material.name,material.version,material.source_kind,
        material.drive_source_id,material.course_id,material.assessment_id
 from public.course_materials material
 where material.drive_source_id is null or exists(
  select 1 from public.drive_sources source
  where source.id=material.drive_source_id
   and source.current_material_id=material.id and source.available
 );
revoke all on public.current_course_materials from public,anon,authenticated;
grant select on public.current_course_materials to authenticated,service_role;
