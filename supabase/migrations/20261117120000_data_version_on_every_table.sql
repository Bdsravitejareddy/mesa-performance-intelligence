-- Pages reuse cached figures while public.workspace_data_version is unchanged, and the version moves only through
-- triggers. Tables added after that mechanism (overview summaries, SWOT snapshots, weekly tasks, course context,
-- the competency list, insight summaries, AI consents, Drive state, ...) had no trigger, so writing to them left
-- pages showing the earlier figures until something else changed. Every public table now bumps the version; new
-- tables must add the trigger too (see the test that checks this).
do $$
declare target record;
begin
  for target in
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'workspace_data_version'
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'bump_workspace_data_version')
  loop
    execute format('create trigger bump_workspace_data_version after insert or update or delete on public.%I for each statement execute function private.bump_workspace_data_version()', target.name);
  end loop;
end $$;
