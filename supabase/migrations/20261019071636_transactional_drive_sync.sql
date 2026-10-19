-- Connector secrets are hashes only. Connector RPCs require the service role, then
-- independently authorize the connection's verified, invited owner (no JWT sub).
create table public.drive_connections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  label text not null default '', enabled boolean not null default true, mapping_revision integer not null default 1,
  last_error text, last_scan_at timestamptz, created_at timestamptz not null default now(),
  unique(id,user_id)
);
create table public.drive_folder_mappings (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null, user_id uuid not null,
  drive_folder_id text not null check(length(trim(drive_folder_id))>0), mode text not null check(mode in ('course','collection')),
  course_id uuid, course_user_id uuid, root_course_title text not null check(length(trim(root_course_title))>0),
  enabled boolean not null default true,
  foreign key(connection_id,user_id) references public.drive_connections(id,user_id),
  foreign key(course_id,course_user_id) references public.courses(id,user_id),
  check((course_id is null) = (course_user_id is null)), unique(connection_id,drive_folder_id), unique(id,connection_id,user_id)
);
create table public.drive_scans (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null, user_id uuid not null,
  mapping_revision integer not null, checkpoint jsonb not null default '{"roots":{}}', completed_root_ids uuid[] not null default '{}',
  status text not null default 'running' check(status in ('running','complete','failed','superseded')),
  created_at timestamptz not null default now(), completed_at timestamptz,
  foreign key(connection_id,user_id) references public.drive_connections(id,user_id), unique(id,connection_id,user_id)
);
create unique index drive_one_running_scan on public.drive_scans(connection_id) where status='running';
create table public.drive_sources (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null, user_id uuid not null,
  folder_mapping_id uuid not null, drive_file_id text not null, export_format text not null,
  course_id uuid not null, course_user_id uuid not null, course_folder_id text not null,
  current_material_id uuid, fingerprint text, metadata jsonb not null default '{}', available boolean not null default false,
  last_seen_scan_id uuid, version integer not null default 0,
  foreign key(folder_mapping_id,connection_id,user_id) references public.drive_folder_mappings(id,connection_id,user_id),
  foreign key(course_id,course_user_id) references public.courses(id,user_id),
  foreign key(current_material_id,course_user_id) references public.course_materials(id,user_id),
  foreign key(last_seen_scan_id,connection_id,user_id) references public.drive_scans(id,connection_id,user_id),
  unique(drive_file_id,export_format), unique(id,user_id), unique(id,course_user_id,course_id)
);
create table public.drive_import_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, connection_id uuid not null,
  source_id uuid not null, scan_id uuid not null, mapping_revision integer not null,
  source_snapshot jsonb not null, lease_expires_at timestamptz not null default now()+interval '5 minutes',
  last_error text, attempt_count integer not null default 0, status text not null default 'leased' check(status in ('leased','expired','published')),
  storage_path text not null, material_id uuid, version integer,
  foreign key(source_id,user_id) references public.drive_sources(id,user_id),
  foreign key(scan_id,connection_id,user_id) references public.drive_scans(id,connection_id,user_id),
  unique(id,user_id)
);
create unique index drive_one_source_lease on public.drive_import_items(source_id) where status='leased';
alter table public.course_materials add column drive_source_id uuid, add column drive_source_version integer;
alter table public.course_materials add constraint material_drive_source_owner foreign key(drive_source_id,user_id,course_id) references public.drive_sources(id,course_user_id,course_id);
alter table public.course_materials add constraint material_drive_version check((drive_source_id is null and drive_source_version is null) or (drive_source_id is not null and drive_source_version=version));
create unique index drive_material_version on public.course_materials(drive_source_id,drive_source_version);
create table private.drive_credentials (
  connection_id uuid primary key references public.drive_connections(id),
  pairing_hash text unique check(pairing_hash ~ '^[a-f0-9]{64}$'), pairing_expires_at timestamptz,
  token_hash text unique check(token_hash ~ '^[a-f0-9]{64}$')
);
alter table private.drive_credentials enable row level security;
revoke all on private.drive_credentials from public,anon,authenticated;
grant usage on schema private,auth to service_role;
grant select(id,email,email_confirmed_at) on auth.users to service_role;
grant select on private.workspace_access to service_role;
grant select,insert,update,delete on private.drive_credentials to service_role;

do $$ declare t text; begin
  foreach t in array array['drive_connections','drive_folder_mappings','drive_scans','drive_sources','drive_import_items'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
    execute format('create policy workspace_read on public.%I for select to authenticated using (user_id in (select private.mesa_workspace_member_ids()))',t);
  end loop;
end $$;
grant select,insert,update on public.courses,public.course_materials,public.material_pages to service_role;

create function private.drive_owner_allowed(p_user_id uuid) returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from auth.users u join private.workspace_access a on a.email=lower(u.email) where u.id=p_user_id and u.email_confirmed_at is not null)
$$;
create function private.drive_connection(p_connection_id uuid) returns public.drive_connections language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; begin
 select * into c from public.drive_connections where id=p_connection_id for update;
 if not found or not c.enabled or not private.drive_owner_allowed(c.user_id) then raise exception 'Drive connection unavailable' using errcode='42501'; end if;
 return c;
end $$;

create function public.drive_sync_configure(p_user_id uuid,p_connection_id uuid,p_mappings jsonb,p_label text default '',p_enabled boolean default true) returns jsonb language plpgsql security invoker set search_path='' as $$
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
   insert into public.drive_folder_mappings(connection_id,user_id,drive_folder_id,mode,course_id,course_user_id,root_course_title)
    values(c.id,c.user_id,m->>'driveFolderId',m->>'mode',cid,cuid,m->>'rootCourseTitle')
    on conflict(connection_id,drive_folder_id) do update set enabled=true,mode=excluded.mode,course_id=excluded.course_id,course_user_id=excluded.course_user_id,root_course_title=excluded.root_course_title;
 end loop;
 return jsonb_build_object('id',c.id,'userId',c.user_id,'enabled',c.enabled,'label',c.label,'mappingRevision',c.mapping_revision,'mappings',(select jsonb_agg(jsonb_build_object('id',id,'driveFolderId',drive_folder_id,'mode',mode,'courseId',course_id,'rootCourseTitle',root_course_title)) from public.drive_folder_mappings where connection_id=c.id and enabled));
end $$;

create function public.drive_sync_issue_pairing(p_connection_id uuid,p_hash text,p_expires_at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
begin perform private.drive_connection(p_connection_id);
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '15 minutes' then raise exception 'Pairing expiry must be within 15 minutes'; end if;
 insert into private.drive_credentials(connection_id,pairing_hash,pairing_expires_at) values(p_connection_id,p_hash,p_expires_at)
 on conflict(connection_id) do update set pairing_hash=excluded.pairing_hash,pairing_expires_at=excluded.pairing_expires_at,token_hash=null;
end $$;
create function public.drive_sync_consume_pairing(p_pairing_hash text,p_token_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cid uuid; c public.drive_connections; begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid token hash'; end if;
 select connection_id into cid from private.drive_credentials where pairing_hash=p_pairing_hash;
 if not found then raise exception 'Invalid or expired pairing'; end if;
 c:=private.drive_connection(cid);
 update private.drive_credentials set pairing_hash=null,pairing_expires_at=null,token_hash=p_token_hash where connection_id=cid and pairing_hash=p_pairing_hash and pairing_expires_at>now();
 if not found then raise exception 'Invalid or expired pairing'; end if;
 return jsonb_build_object('connectionId',c.id,'userId',c.user_id);
end $$;
create function public.drive_sync_authenticate(p_token_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; begin
 select c1.* into c from public.drive_connections c1 join private.drive_credentials cr on cr.connection_id=c1.id where cr.token_hash=p_token_hash and c1.enabled;
 if not found or not private.drive_owner_allowed(c.user_id) then return null; end if;
 return jsonb_build_object('connectionId',c.id,'userId',c.user_id);
end $$;
create function public.drive_sync_start_scan(p_connection_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections; s public.drive_scans; begin
 c:=private.drive_connection(p_connection_id);
 select * into s from public.drive_scans where connection_id=c.id and status='running';
 if not found then insert into public.drive_scans(connection_id,user_id,mapping_revision) values(c.id,c.user_id,c.mapping_revision) returning * into s; end if;
 return jsonb_build_object('scanId',s.id,'checkpoint',s.checkpoint,'mappings',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'driveFolderId',drive_folder_id,'mode',mode,'courseId',course_id,'rootCourseTitle',root_course_title)),'[]') from public.drive_folder_mappings where connection_id=c.id and enabled));
end $$;

create function public.drive_sync_reserve(p_connection_id uuid,p_scan_id uuid,p_source jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 if fmt='unsupported' then return jsonb_build_object('decision','unsupported'); end if;
 if src.current_material_id is not null and src.fingerprint=p_source->>'fingerprint' then
  update public.drive_sources set available=true where id=src.id;
  return jsonb_build_object('decision','unchanged'); end if;
 update public.drive_import_items set status='expired' where source_id=src.id and status='leased' and lease_expires_at<=now();
 if exists(select 1 from public.drive_import_items where source_id=src.id and status='leased') then return jsonb_build_object('decision','retry_later'); end if;
 insert into public.drive_import_items(id,user_id,connection_id,source_id,scan_id,mapping_revision,source_snapshot,storage_path)
 values(iid,c.user_id,c.id,src.id,s.id,c.mapping_revision,p_source,src.course_user_id::text||'/'||src.course_id::text||'/drive/'||iid::text||'.'||fmt) returning * into item;
 return jsonb_build_object('decision','upload','itemId',item.id,'storagePath',item.storage_path,'exportFormat',fmt);
end $$;

create function public.drive_sync_publish(p_connection_id uuid,p_item_id uuid,p_pages jsonb,p_object_size bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 values(src.course_user_id,src.course_id,i.source_snapshot->>'name',i.storage_path,case src.export_format when 'pdf' then 'application/pdf' else 'application/vnd.openxmlformats-officedocument.presentationml.presentation' end,p_object_size,ver,'complete',src.id,ver) returning id into mid;
 for p in select value from jsonb_array_elements(p_pages) loop
  insert into public.material_pages(user_id,material_id,page_number,extracted_text,table_data,has_visuals)
  values(src.course_user_id,mid,(p->>'pageNumber')::integer,coalesce(p->>'text',''),coalesce(p->'tables','[]'),coalesce((p->>'hasVisuals')::boolean,false));
 end loop;
 update public.drive_sources set current_material_id=mid,version=ver,fingerprint=i.source_snapshot->>'fingerprint',metadata=i.source_snapshot,available=true where id=src.id;
 update public.drive_import_items set status='published',material_id=mid,version=ver where id=i.id;
 return jsonb_build_object('materialId',mid,'version',ver);
end $$;

create function public.drive_sync_checkpoint(p_connection_id uuid,p_scan_id uuid,p_value jsonb,p_completed_root_ids jsonb) returns void language plpgsql security invoker set search_path='' as $$
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
 update public.drive_connections set last_scan_at=now(),last_error=case when exists(select 1 from public.drive_scans where id=s.id and status='failed') then 'One or more Drive roots failed' else last_error end where id=c.id;
end $$;
create function public.drive_sync_revoke(p_connection_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin perform private.drive_connection(p_connection_id);
 update public.drive_connections set enabled=false where id=p_connection_id;
 delete from private.drive_credentials where connection_id=p_connection_id;
end $$;
create function public.drive_sync_record_error(p_connection_id uuid,p_message text,p_item_id uuid default null) returns void language plpgsql security invoker set search_path='' as $$
begin perform private.drive_connection(p_connection_id);
 if p_item_id is not null then
  update public.drive_import_items set status=case when status='leased' then 'expired' else status end,last_error=left(p_message,1000),attempt_count=attempt_count+1 where id=p_item_id and connection_id=p_connection_id;
  if not found then raise exception 'Item unavailable'; end if;
 end if;
 update public.drive_connections set last_error=left(p_message,1000) where id=p_connection_id;
end $$;

create table private.drive_pairing_attempts (
 key_hash text primary key check(key_hash ~ '^[a-f0-9]{64}$'),
 window_started_at timestamptz not null default now(), attempt_count integer not null default 1
);
alter table private.drive_pairing_attempts enable row level security;
revoke all on private.drive_pairing_attempts from public,anon,authenticated;
grant select,insert,update,delete on private.drive_pairing_attempts to service_role;
create function public.drive_sync_attempt_pairing(p_key_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
declare attempts integer; begin
 if p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid pairing client hash'; end if;
 -- Client hashes expire with their budget; cap growth from old caller identities.
 delete from private.drive_pairing_attempts where window_started_at<now()-interval '1 day';
 insert into private.drive_pairing_attempts(key_hash) values(p_key_hash)
 on conflict(key_hash) do update set
 attempt_count=case when private.drive_pairing_attempts.window_started_at<=now()-interval '15 minutes' then 1 else least(private.drive_pairing_attempts.attempt_count+1,11) end,
 window_started_at=case when private.drive_pairing_attempts.window_started_at<=now()-interval '15 minutes' then now() else private.drive_pairing_attempts.window_started_at end
 returning attempt_count into attempts;
 return attempts<=10;
end $$;

-- Protect historical citations and extracted pages from edits or deletion.
create function private.drive_immutable_material() returns trigger language plpgsql security invoker set search_path='' as $$
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
  if exists(select 1 from public.course_materials where id=old.material_id and drive_source_id is not null) then raise exception 'Imported pages are immutable'; end if;
 end if;
 if tg_op='UPDATE' then return new; end if;
 return old;
end $$;
create trigger immutable_drive_material before insert or update or delete on public.course_materials for each row execute function private.drive_immutable_material();
create trigger immutable_drive_pages before insert or update or delete on public.material_pages for each row execute function private.drive_immutable_material();
-- Only grant the explicitly enumerated new function surface; do not alter unrelated functions.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'drive_sync_%') or (n.nspname='private' and p.proname like 'drive_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- Safe membership probe for dashboard configuration, including an empty workspace.
create function public.drive_sync_workspace_member() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.mesa_workspace_member_ids())
$$;
revoke all on function public.drive_sync_workspace_member() from public,anon;
grant execute on function public.drive_sync_workspace_member() to authenticated;
