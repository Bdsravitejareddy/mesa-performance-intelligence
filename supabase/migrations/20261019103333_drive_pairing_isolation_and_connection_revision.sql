-- Pairing budgets are durable and independent. A blocked caller does not spend
-- another code's budget or the global safety allowance. Inputs contain hashes only.
create function public.drive_sync_attempt_pairing_scoped(p_caller_hash text,p_code_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare attempts integer;
 global_hash text := encode(sha256('drive-agent-pair-global'::bytea),'hex');
begin
 if p_caller_hash is null or p_caller_hash !~ '^[a-f0-9]{64}$'
    or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then
   raise exception 'Invalid pairing budget hash';
 end if;
 if not public.drive_sync_attempt_pairing(p_caller_hash) then return false; end if;
 if not public.drive_sync_attempt_pairing(p_code_hash) then return false; end if;
 -- 1000 attempts per 15 minutes is a last-resort ceiling, not a shared user quota.
 insert into private.drive_pairing_attempts(key_hash) values(global_hash)
 on conflict(key_hash) do update set
 attempt_count=case when private.drive_pairing_attempts.window_started_at<=now()-interval '15 minutes' then 1 else least(private.drive_pairing_attempts.attempt_count+1,1001) end,
 window_started_at=case when private.drive_pairing_attempts.window_started_at<=now()-interval '15 minutes' then now() else private.drive_pairing_attempts.window_started_at end
 returning attempt_count into attempts;
 return attempts<=1000;
end $$;
revoke all on function public.drive_sync_attempt_pairing_scoped(text,text) from public,anon,authenticated;
grant execute on function public.drive_sync_attempt_pairing_scoped(text,text) to service_role;

-- The API merges omitted PATCH fields from a snapshot. Fence that snapshot while
-- holding the same row lock used by configure, before any configuration writes.
create function public.drive_sync_configure_if_current(
 p_user_id uuid,p_connection_id uuid,p_mappings jsonb,p_label text,p_enabled boolean,p_expected_mapping_revision integer
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.drive_connections;
begin
 if not private.drive_owner_allowed(p_user_id) then
   raise exception 'Owner is not a verified invited member' using errcode='42501';
 end if;
 select * into c from public.drive_connections where id=p_connection_id for update;
 if not found or not private.drive_owner_allowed(c.user_id) then raise exception 'Connection unavailable'; end if;
 if p_expected_mapping_revision is null or c.mapping_revision<>p_expected_mapping_revision then
   raise exception 'Drive connection changed. Reload it and try again.' using errcode='40001';
 end if;
 return public.drive_sync_configure(p_user_id,p_connection_id,p_mappings,p_label,p_enabled);
end $$;
revoke all on function public.drive_sync_configure_if_current(uuid,uuid,jsonb,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.drive_sync_configure_if_current(uuid,uuid,jsonb,text,boolean,integer) to service_role;
