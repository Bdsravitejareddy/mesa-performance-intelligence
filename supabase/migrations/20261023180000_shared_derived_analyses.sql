-- Both approved logins belong to one workspace, and the nightly refresh writes its results under the sync owner.
-- Derived analyses (thinking patterns, the personality reading of written context, the AI skill view) are
-- therefore readable by every workspace member, so each login sees the latest. The raw inputs they draw on
-- (assistant profiles and conversation imports) stay private to the account that added them.
drop policy if exists own_analyses on public.behaviour_analyses;
create policy workspace_access on public.behaviour_analyses for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

drop policy if exists own_readings on public.personality_readings;
create policy workspace_access on public.personality_readings for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

drop policy if exists own_views on public.ai_skill_views;
create policy workspace_access on public.ai_skill_views for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
