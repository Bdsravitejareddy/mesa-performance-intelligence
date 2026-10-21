create table public.role_evidence_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_profile_id uuid not null,
  requirement_id text not null check (length(trim(requirement_id)) between 1 and 160),
  competency text not null check (length(trim(competency)) between 1 and 200),
  requirement_quote text not null default '',
  suggested_state text not null check (suggested_state in ('demonstrated','adjacent','unverified','development_needed')),
  state text not null check (state in ('demonstrated','adjacent','unverified','development_needed')),
  review_status text not null default 'suggested' check (review_status in ('suggested','accepted','dismissed')),
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  confidence text not null check (confidence in ('high','medium','low','insufficient')),
  next_action text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  unique (role_profile_id,requirement_id),
  foreign key (role_profile_id,user_id) references public.role_profiles(id,user_id) on delete cascade,
  check ((review_status = 'accepted' and state = 'demonstrated') or (review_status <> 'accepted' and state <> 'demonstrated'))
);

create index role_evidence_findings_profile_user_idx on public.role_evidence_findings(role_profile_id,user_id);
alter table public.role_evidence_findings enable row level security;
revoke all on public.role_evidence_findings from public,anon,authenticated;
grant select,insert,update,delete on public.role_evidence_findings to authenticated;
create policy workspace_access on public.role_evidence_findings
for all to authenticated
using (user_id in (select private.mesa_workspace_member_ids()))
with check (user_id in (select private.mesa_workspace_member_ids()));

create function private.validate_role_evidence_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  source_id uuid;
  source_kind text;
  valid_source boolean;
begin
  for item in select value from jsonb_array_elements(new.evidence_refs) loop
    source_kind := item ->> 'kind';
    if coalesce(item ->> 'id','') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Role evidence contains an invalid source identifier';
    end if;
    source_id := (item ->> 'id')::uuid;
    valid_source := case source_kind
      when 'evaluation_finding' then exists (select 1 from public.evaluation_evidence where id = source_id and user_id = new.user_id)
      when 'topic_competency' then exists (select 1 from public.topic_competencies where id = source_id and user_id = new.user_id)
      when 'linked_submission' then exists (select 1 from public.submissions where id = source_id and user_id = new.user_id)
      else false
    end;
    if not valid_source then raise exception 'Role evidence contains an unknown or cross-workspace citation'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.validate_role_evidence_refs() from public,anon,authenticated;
create trigger validate_role_evidence_refs
before insert or update of evidence_refs,user_id on public.role_evidence_findings
for each row execute function private.validate_role_evidence_refs();
