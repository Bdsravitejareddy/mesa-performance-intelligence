-- One shared rubric for the workspace: the weights and thresholds every calculation uses. Members can change
-- them; defaults apply until someone does.
create table public.rubric_settings (
  id text primary key default 'workspace' check (id = 'workspace'),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.rubric_settings enable row level security;
revoke all on public.rubric_settings from public, anon, authenticated;
grant select, insert, update on public.rubric_settings to authenticated;
create policy workspace_access on public.rubric_settings for all to authenticated
using ((select auth.uid()) in (select private.mesa_workspace_member_ids()))
with check ((select auth.uid()) in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.rubric_settings
for each statement execute function private.bump_workspace_data_version();
