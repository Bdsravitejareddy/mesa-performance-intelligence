-- Student evidence stays separate from course knowledge and official marks.
create table public.submission_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  source_kind text not null check (source_kind in ('lms','drive','upload')),
  source_id text,
  source_url text,
  course_material_id uuid,
  name text not null check (length(trim(name)) > 0),
  mime_type text not null check (mime_type in (
    'application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  storage_path text,
  extracted_text text not null default '',
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','complete','failed','needs_visual_review')),
  source_version text not null check (length(trim(source_version)) > 0),
  created_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (submission_id,user_id) references public.submissions(id,user_id) on delete cascade,
  foreign key (course_material_id,user_id) references public.course_materials(id,user_id),
  check (storage_path is not null or nullif(trim(source_id),'') is not null),
  check (source_kind <> 'upload' or storage_path is not null),
  check (storage_path is null or (
    split_part(storage_path,'/',1) = user_id::text
    and split_part(storage_path,'/',2) = submission_id::text
    and length(split_part(storage_path,'/',3)) > 0
  ))
);
create index submission_documents_submission_idx on public.submission_documents(submission_id,user_id);
create index submission_documents_material_idx on public.submission_documents(course_material_id,user_id);
alter table public.submission_documents enable row level security;
revoke all on public.submission_documents from public,anon,authenticated;
grant select,insert,update,delete on public.submission_documents to authenticated;
create policy workspace_access on public.submission_documents
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('submission-files','submission-files',false,20971520,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

-- The first two path segments must identify a visible, same-owner submission.
-- No UPDATE policy: versions always use new immutable objects, never upserts.
create policy "submission files workspace select" on storage.objects
for select to authenticated using (
  bucket_id = 'submission-files' and exists (
    select 1 from public.submissions as submission
    where submission.user_id::text = (storage.foldername(name))[1]
      and submission.id::text = (storage.foldername(name))[2]
  )
);
create policy "submission files workspace insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'submission-files' and exists (
    select 1 from public.submissions as submission
    where submission.user_id::text = (storage.foldername(name))[1]
      and submission.id::text = (storage.foldername(name))[2]
  )
);
create policy "submission files workspace delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'submission-files' and exists (
    select 1 from public.submissions as submission
    where submission.user_id::text = (storage.foldername(name))[1]
      and submission.id::text = (storage.foldername(name))[2]
  )
);
