-- Device-style pairing: the Apps Script generates its own one-time code and registers only its SHA-256 hash
-- with a short display code; a signed-in member approves that display code for a connection, which issues the
-- normal pairing for that hash. The installer file therefore contains no secret. Service role only.
create table public.drive_pairing_requests (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  display_code text not null check (display_code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_connection_id uuid references public.drive_connections(id) on delete cascade,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  check ((approved_connection_id is null) = (approved_at is null))
);
create index drive_pairing_requests_recent_idx on public.drive_pairing_requests(created_at desc);
alter table public.drive_pairing_requests enable row level security;
revoke all on public.drive_pairing_requests from public, anon, authenticated;
