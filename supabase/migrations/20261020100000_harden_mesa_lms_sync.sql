-- Keep LMS imports within the currently invited workspace and make sparse source
-- refreshes safe when cron and a manual sync overlap.
create or replace function public.mesa_lms_sync_member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.id
  from auth.users as member
  join private.workspace_access as invitation on invitation.email = lower(member.email)
  where member.email_confirmed_at is not null
  order by lower(member.email), member.id;
$$;
revoke all on function public.mesa_lms_sync_member_ids() from public, anon, authenticated;
grant execute on function public.mesa_lms_sync_member_ids() to service_role;

create or replace function private.preserve_sparse_mesa_lms_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source_record_id like 'mesa-lms:submission:%' then
    if old.source_updated_at is not null and new.source_updated_at is not null
       and new.source_updated_at < old.source_updated_at then
      new.answer_text := old.answer_text;
      new.official_mark := old.official_mark;
      new.official_feedback := old.official_feedback;
      new.official_mark_source := old.official_mark_source;
      new.submitted_at := old.submitted_at;
      new.lms_submission_status := old.lms_submission_status;
      new.source_updated_at := old.source_updated_at;
    else
      new.answer_text := coalesce(nullif(new.answer_text, ''), old.answer_text);
      new.official_mark := coalesce(new.official_mark, old.official_mark);
      new.official_feedback := coalesce(nullif(new.official_feedback, ''), old.official_feedback);
      new.official_mark_source := coalesce(nullif(new.official_mark_source, ''), old.official_mark_source);
      new.submitted_at := coalesce(new.submitted_at, old.submitted_at);
      new.lms_submission_status := coalesce(nullif(new.lms_submission_status, ''), old.lms_submission_status);
      new.source_updated_at := coalesce(new.source_updated_at, old.source_updated_at);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_sparse_mesa_lms_submission() from public, anon, authenticated;

create trigger preserve_sparse_mesa_lms_submission
before update on public.submissions
for each row execute function private.preserve_sparse_mesa_lms_submission();
