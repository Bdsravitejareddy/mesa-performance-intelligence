-- Member-approved, read-only capture of what each Nexus assignment page shows but the MCP does not return:
-- the submission's timing, group context, submitted links and submitted files. Files are fetched server-side
-- from the page's short-lived signed URL and stored privately; links are fetched later by the Drive connector,
-- which reads them with the student's own Google access. Signed URLs are never stored.

-- Submitted Word and Excel files are evidence too.
alter table public.submission_documents drop constraint submission_documents_mime_type_check;
alter table public.submission_documents add constraint submission_documents_mime_type_check check (mime_type in (
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
));
update storage.buckets set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
] where id = 'submission-files';

-- What the assignment page showed when captured: status, submitted time, on-time/late, group members and submitter.
alter table public.submissions add column page_capture jsonb check (page_capture is null or jsonb_typeof(page_capture) = 'object');

create table public.submission_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  url text not null check (url ~ '^https://' and length(url) <= 2000),
  drive_file_id text check (drive_file_id is null or drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  captured_at timestamptz not null default now(),
  unique (submission_id, url),
  foreign key (submission_id, user_id) references public.submissions(id, user_id) on delete cascade
);
create index submission_links_drive_idx on public.submission_links(drive_file_id) where drive_file_id is not null;
alter table public.submission_links enable row level security;
revoke all on public.submission_links from public, anon, authenticated;
grant select, insert, update, delete on public.submission_links to authenticated;
create policy workspace_access on public.submission_links for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));
create trigger bump_workspace_data_version after insert or update or delete on public.submission_links
for each statement execute function private.bump_workspace_data_version();

-- Files fetched from links on Nexus submission pages attach to their submission without title guessing.
alter table public.material_submission_matches drop constraint material_submission_matches_method_check;
alter table public.material_submission_matches add constraint material_submission_matches_method_check check (method in ('title_and_ai','title_only','member','nexus_link'));
