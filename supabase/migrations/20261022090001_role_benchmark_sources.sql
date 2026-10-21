alter table public.role_profiles
  add column if not exists employer text not null default '',
  add column if not exists source_url text,
  add column if not exists retrieved_at timestamptz,
  add column if not exists posting_date date,
  add column if not exists is_verified boolean not null default false,
  add column if not exists source_content_hash text;

alter table public.role_profiles
  add constraint role_profiles_source_url_https check (source_url is null or source_url ~ '^https://[^[:space:]/?#]+(/|$)'),
  add constraint role_profiles_verified_source_complete check (
    not is_verified or (
      employer <> '' and source_url is not null and retrieved_at is not null
      and posting_date is not null and source_content_hash is not null
      and jsonb_typeof(competencies) = 'array'
    )
  );

comment on column public.role_profiles.source_url is 'Canonical public role source reviewed by the workspace member; nullable for incomplete user-entered profiles.';
comment on column public.role_profiles.retrieved_at is 'Server retrieval time for the source page; null when no permitted page was fetched.';
comment on column public.role_profiles.posting_date is 'Source posting date, when stated and reviewed; null when unknown.';
comment on column public.role_profiles.is_verified is 'True only when a member reviewed the same fetched source content saved by hash, every requirement quote is exact, and the page text explicitly confirms employer, role title, and posting date. Generic metadata dates and user-entered claims do not qualify.';
comment on column public.role_profiles.source_content_hash is 'SHA-256 hash of the fetched source body used for review.';
