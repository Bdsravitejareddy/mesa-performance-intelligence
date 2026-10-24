-- Cached read models refresh when Quiz Tool results change.
create trigger bump_workspace_data_version after insert or update or delete on public.quiz_tool_results
for each statement execute function private.bump_workspace_data_version();
