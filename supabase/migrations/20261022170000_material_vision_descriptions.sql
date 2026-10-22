-- AI-generated descriptions of visual slides sit beside member notes, labelled with the model that wrote them.
alter table public.material_page_notes
  add column author_kind text not null default 'member' check (author_kind in ('member','ai_vision')),
  add column provider_model text not null default '' check (length(provider_model) <= 120),
  add column colour_meaning text not null default '' check (length(colour_meaning) <= 1000),
  add column decorative boolean not null default false;

alter table public.material_page_notes
  add constraint material_page_notes_ai_model check (author_kind <> 'ai_vision' or length(trim(provider_model)) > 0);

alter table public.material_page_notes
  drop constraint material_page_notes_material_id_page_number_key;
create unique index material_page_notes_unique_author
  on public.material_page_notes(material_id, page_number, author_kind);

-- One row per description attempt, so failures stay visible and the scheduled job does not retry endlessly.
create table public.material_vision_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  material_id uuid not null,
  status text not null check (status in ('succeeded','failed','skipped')),
  provider_model text not null default '',
  pages_requested integer not null default 0 check (pages_requested >= 0),
  pages_described integer not null default 0 check (pages_described >= 0),
  message text not null default '' check (length(message) <= 500),
  ran_at timestamptz not null default now(),
  foreign key (material_id, user_id) references public.course_materials(id, user_id) on delete cascade
);
create index material_vision_runs_material_idx on public.material_vision_runs(material_id, ran_at desc);
alter table public.material_vision_runs enable row level security;
revoke all on public.material_vision_runs from public, anon, authenticated;
grant select, insert on public.material_vision_runs to authenticated;
create policy workspace_access on public.material_vision_runs
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
