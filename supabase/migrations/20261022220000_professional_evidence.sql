-- Professional evidence: resumes, projects, portfolios, certifications. A resume line is a claim, not proof.
create table public.professional_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('resume','work_experience','project','portfolio','certification','dashboard','repository','presentation','achievement','other')),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  url text check (url is null or url ~ '^https://[^[:space:]]+$'),
  storage_path text,
  mime_type text,
  file_size bigint check (file_size is null or (file_size > 0 and file_size <= 20971520)),
  extracted_text text not null default '',
  issued_by text not null default '' check (length(issued_by) <= 200),
  occurred_on date,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  check (storage_path is null or split_part(storage_path, '/', 1) = user_id::text)
);
alter table public.professional_evidence enable row level security;
revoke all on public.professional_evidence from public, anon, authenticated;
grant select, insert, update, delete on public.professional_evidence to authenticated;
create policy workspace_access on public.professional_evidence for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

-- Claims made in professional evidence, mapped to competencies. Only member-linked supporting evidence
-- (another evidence item or an official mark) can move a claim from 'claimed' to 'supported'.
create table public.professional_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  evidence_id uuid not null,
  claim text not null check (length(trim(claim)) between 1 and 600),
  claim_type text not null check (claim_type in ('skill','experience','achievement','responsibility','credential')),
  quantified boolean not null default false,
  competency_id text references public.competencies(id),
  status text not null default 'claimed' check (status in ('claimed','supported','withdrawn')),
  supporting_evidence_id uuid,
  supporting_note text not null default '' check (length(supporting_note) <= 600),
  extracted_by text not null default 'member' check (extracted_by in ('member','ai')),
  provider_model text not null default '',
  created_at timestamptz not null default now(),
  foreign key (evidence_id, user_id) references public.professional_evidence(id, user_id) on delete cascade,
  foreign key (supporting_evidence_id) references public.professional_evidence(id) on delete set null,
  check (status <> 'supported' or supporting_evidence_id is not null),
  check (supporting_evidence_id is null or supporting_evidence_id <> evidence_id)
);
create index professional_claims_competency_idx on public.professional_claims(competency_id);
alter table public.professional_claims enable row level security;
revoke all on public.professional_claims from public, anon, authenticated;
grant select, insert, update, delete on public.professional_claims to authenticated;
create policy workspace_access on public.professional_claims for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence-files', 'evidence-files', false, 20971520, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]) on conflict (id) do nothing;

create policy "evidence files workspace select" on storage.objects for select to authenticated
using (bucket_id = 'evidence-files' and ((storage.foldername(name))[1])::uuid in (select private.mesa_workspace_member_ids()));
create policy "evidence files workspace insert" on storage.objects for insert to authenticated
with check (bucket_id = 'evidence-files' and ((storage.foldername(name))[1])::uuid in (select private.mesa_workspace_member_ids()));
create policy "evidence files workspace delete" on storage.objects for delete to authenticated
using (bucket_id = 'evidence-files' and ((storage.foldername(name))[1])::uuid in (select private.mesa_workspace_member_ids()));
