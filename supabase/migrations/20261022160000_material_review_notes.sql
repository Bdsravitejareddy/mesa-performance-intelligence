-- Member interpretations of slides the importer could not read (images, charts, diagrams).
-- Imported pages stay immutable; notes live beside them, labelled as member notes, never as course text.
create table public.material_page_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  material_id uuid not null,
  page_number integer not null check (page_number > 0),
  note text not null check (length(trim(note)) between 1 and 2000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, page_number),
  foreign key (material_id, user_id) references public.course_materials(id, user_id) on delete cascade
);
create index material_page_notes_material_idx on public.material_page_notes(material_id);
alter table public.material_page_notes enable row level security;
revoke all on public.material_page_notes from public, anon, authenticated;
grant select, insert, update, delete on public.material_page_notes to authenticated;
create policy workspace_access on public.material_page_notes
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

-- A member's sign-off that a flagged document has been looked at. It does not alter the import status.
create table public.material_reviews (
  material_id uuid primary key,
  user_id uuid not null,
  outcome text not null check (outcome in ('reviewed','not_needed')),
  note text not null default '' check (length(note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null default auth.uid(),
  reviewed_at timestamptz not null default now(),
  foreign key (material_id, user_id) references public.course_materials(id, user_id) on delete cascade
);
alter table public.material_reviews enable row level security;
revoke all on public.material_reviews from public, anon, authenticated;
grant select, insert, update, delete on public.material_reviews to authenticated;
create policy workspace_access on public.material_reviews
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
