-- The component breakdown from Mesa's official grade report PDF (Nexus → Attendance & Grade → Grade → Report card):
-- each course's components with weight, marks obtained and maximum, its printed cumulative and grade, and
-- out-of-class programmes such as BYOB. Imported through the member's own signed-in browser (read-only, see
-- AGENTS.md); get_grades does not return it. Members may write only these columns: the term GPA and course grades
-- stay as the daily sync read them.
alter table public.lms_report_cards
  add column breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(breakdown) = 'array'),
  add column out_class jsonb not null default '[]'::jsonb check (jsonb_typeof(out_class) = 'array'),
  add column breakdown_source text not null default '' check (length(breakdown_source) <= 200),
  add column breakdown_generated_on date,
  add column breakdown_imported_at timestamptz;

grant insert (user_id, term, breakdown, out_class, breakdown_source, breakdown_generated_on, breakdown_imported_at) on public.lms_report_cards to authenticated;
grant update (breakdown, out_class, breakdown_source, breakdown_generated_on, breakdown_imported_at) on public.lms_report_cards to authenticated;
create policy workspace_breakdown_insert on public.lms_report_cards for insert to authenticated
with check (user_id in (select private.mesa_workspace_member_ids()));
create policy workspace_breakdown_update on public.lms_report_cards for update to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
