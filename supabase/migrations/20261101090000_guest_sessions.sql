-- Guest sessions (member-requested, 2026-11-01): a guest signs in with a shared username and password, sees the
-- workspace as a member does, and can make changes; every change a guest makes is logged and undone when the
-- guest signs out or the session expires. Each guest sign-in is its own short-lived auth user, so two guests never
-- undo each other's work. Only the server (service role) can start or end a guest session.
create table private.guest_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);
create table private.guest_changes (
  id bigint generated always as identity primary key,
  guest_id uuid not null,
  table_name text not null,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  changed_at timestamptz not null default now()
);
create index guest_changes_guest_idx on private.guest_changes(guest_id, id);
create table private.guest_login_attempts (
  id bigint generated always as identity primary key,
  client_hash text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index guest_login_attempts_idx on private.guest_login_attempts(client_hash, attempted_at);
alter table private.guest_sessions enable row level security;
alter table private.guest_changes enable row level security;
alter table private.guest_login_attempts enable row level security;
revoke all on private.guest_sessions, private.guest_changes, private.guest_login_attempts from public, anon, authenticated;

-- True while the caller is an active guest.
create function private.is_guest() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.guest_sessions s where s.user_id = (select auth.uid()) and s.ended_at is null);
$$;
revoke all on function private.is_guest() from public, anon;
grant execute on function private.is_guest() to authenticated;

-- Records each row a guest inserts, changes or deletes (including cascades), with its before and after values.
create function private.guest_audit() returns trigger language plpgsql security definer set search_path = '' as $$
declare guest uuid := auth.uid();
begin
  if guest is null or not exists (select 1 from private.guest_sessions s where s.user_id = guest and s.ended_at is null) then return null; end if;
  insert into private.guest_changes(guest_id, table_name, op, old_row, new_row)
  values (guest, tg_table_name, tg_op, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

-- Every public table the signed-in role can write gets the audit trigger. Run again at each guest sign-in, so
-- tables added by later migrations are covered before any guest can write to them.
create function private.attach_guest_audit() returns integer language plpgsql security definer set search_path = '' as $$
declare target record; added integer := 0;
begin
  for target in
    select distinct c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'DELETE'))
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'guest_audit')
  loop
    execute format('create trigger guest_audit after insert or update or delete on public.%I for each row execute function private.guest_audit()', target.name);
    added := added + 1;
  end loop;
  return added;
end $$;
revoke all on function private.attach_guest_audit() from public, anon, authenticated;
select private.attach_guest_audit();

-- Guests may write files only in their own folder, so nothing they do to storage outlives the session.
create policy "guests write only their own files" on storage.objects as restrictive for insert to authenticated
with check (not (select private.is_guest()) or (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "guests change only their own files" on storage.objects as restrictive for update to authenticated
using (not (select private.is_guest()) or (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "guests delete only their own files" on storage.objects as restrictive for delete to authenticated
using (not (select private.is_guest()) or (storage.foldername(name))[1] = (select auth.uid())::text);

-- Counts recent failed sign-ins for a client (and overall), so the shared password cannot be guessed at speed.
create function public.guest_login_allowed(p_client_hash text) returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from private.guest_login_attempts a where a.client_hash = p_client_hash and not a.succeeded and a.attempted_at > now() - interval '15 minutes') < 5
     and (select count(*) from private.guest_login_attempts a where not a.succeeded and a.attempted_at > now() - interval '1 day') < 100;
$$;
create function public.record_guest_login(p_client_hash text, p_succeeded boolean) returns void language sql security definer set search_path = '' as $$
  insert into private.guest_login_attempts(client_hash, succeeded) values (left(p_client_hash, 128), p_succeeded);
  delete from private.guest_login_attempts where attempted_at < now() - interval '7 days';
$$;

-- Starts a session for a guest auth user the server has just created: grants workspace access by its address.
create function public.start_guest_session(p_user_id uuid, p_email text, p_expires_at timestamptz) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.attach_guest_audit();
  insert into private.guest_sessions(user_id, email, expires_at) values (p_user_id, lower(p_email), p_expires_at);
  insert into private.workspace_access(email) values (lower(p_email)) on conflict do nothing;
end $$;

-- Guest sessions past their end time that have not been undone yet.
create function public.expired_guest_sessions() returns setof uuid language sql stable security definer set search_path = '' as $$
  select user_id from private.guest_sessions where ended_at is null and expires_at < now();
$$;

-- Reverses one logged change. Returns the rows it affected (0 when the row was changed since); raises on failure.
create function private.undo_guest_change(change private.guest_changes) returns integer language plpgsql security definer set search_path = '' as $$
declare target regclass; keys text[]; columns text[]; key_match text; column_list text; select_list text; affected integer;
begin
  target := to_regclass(format('public.%I', change.table_name));
  if target is null then raise exception 'table % no longer exists', change.table_name; end if;
  select array_agg(a.attname order by a.attnum) into keys from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = target and i.indisprimary;
  if keys is null then raise exception 'table % has no primary key', change.table_name; end if;
  select array_agg(a.attname order by a.attnum) into columns from pg_attribute a where a.attrelid = target and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity <> 'a';
  select string_agg(format('t.%1$I = k.%1$I', key_name), ' and ') into key_match from unnest(keys) key_name;
  select string_agg(format('%I', column_name), ', '), string_agg(format('o.%I', column_name), ', ') into column_list, select_list from unnest(columns) column_name;
  if change.op = 'INSERT' then
    execute format('delete from %s t using jsonb_populate_record(null::%s, $1) k where %s and to_jsonb(t) = $1', target, target, key_match) using change.new_row;
  elsif change.op = 'UPDATE' then
    execute format('update %s t set (%s) = (select %s from jsonb_populate_record(null::%s, $2) o) from jsonb_populate_record(null::%s, $1) k where %s and to_jsonb(t) = $1',
      target, column_list, select_list, target, target, key_match) using change.new_row, change.old_row;
  else
    execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1) o on conflict do nothing', target, column_list, select_list, target) using change.old_row;
  end if;
  get diagnostics affected = row_count;
  return affected;
end $$;
revoke all on function private.undo_guest_change(private.guest_changes) from public, anon, authenticated;

-- Undoes everything a guest changed, newest first, then removes the guest's access. A change that fails (for example
-- a row whose parent is restored later in the log) is retried in further passes. A row someone else has changed since
-- the guest touched it is left as it is (counted as skipped), so a member's later work is never overwritten.
create function public.end_guest_session(p_user_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare change private.guest_changes; affected integer; reverted integer := 0; skipped integer := 0; guest_email text; notes jsonb := '[]'::jsonb; progress boolean; pass integer := 0; failure text;
begin
  update private.guest_sessions set ended_at = now() where user_id = p_user_id and ended_at is null returning email into guest_email;
  if guest_email is null then return jsonb_build_object('reverted', 0, 'skipped', 0, 'ended', false, 'notes', notes); end if;
  loop
    pass := pass + 1; progress := false;
    for change in select * from private.guest_changes where guest_id = p_user_id order by id desc loop
      begin
        affected := private.undo_guest_change(change);
        if affected > 0 then reverted := reverted + 1;
        else skipped := skipped + 1; notes := notes || jsonb_build_object('table', change.table_name, 'op', change.op, 'reason', 'changed since the guest touched it');
        end if;
        delete from private.guest_changes where id = change.id;
        progress := true;
      exception when others then
        failure := left(sqlerrm, 200);
        if pass >= 5 then
          skipped := skipped + 1; notes := notes || jsonb_build_object('table', change.table_name, 'op', change.op, 'reason', failure);
          delete from private.guest_changes where id = change.id;
        end if;
      end;
    end loop;
    exit when not exists (select 1 from private.guest_changes where guest_id = p_user_id) or (not progress and pass >= 5);
    if not progress then pass := 4; end if; -- nothing moved: one last pass records the failures
  end loop;
  delete from private.guest_changes where guest_id = p_user_id;
  delete from private.workspace_access where email = guest_email;
  return jsonb_build_object('reverted', reverted, 'skipped', skipped, 'ended', true, 'notes', notes);
end $$;

revoke all on function public.guest_login_allowed(text), public.record_guest_login(text, boolean), public.start_guest_session(uuid, text, timestamptz),
  public.expired_guest_sessions(), public.end_guest_session(uuid) from public, anon, authenticated;
grant execute on function public.guest_login_allowed(text), public.record_guest_login(text, boolean), public.start_guest_session(uuid, text, timestamptz),
  public.expired_guest_sessions(), public.end_guest_session(uuid) to service_role;
