# Deployment and setup (for the workspace owner)

This used to be on the student-facing "Setup & help" page. It is kept here so the page can show students their own
connections and sync status instead.

## Checklist

1. Create or select your Supabase project. Use the project intended for Mesa.
2. Apply the database migrations: `npx supabase link --project-ref YOUR_PROJECT_REF`, then `npx supabase db push`.
   Run them only after confirming the target project reference.
3. Set workspace environment variables on Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `APP_ALLOWED_EMAILS` and `NEXT_PUBLIC_DEMO_MODE` (set to `false` for the live workspace). Server-only secrets
   (`SUPABASE_SECRET_KEY`, `CRON_SECRET`, `NEXUS_MCP_TOKEN`, AI provider keys) stay in Vercel and are never committed.
4. Sign in with an approved account. Each approved email is invited to the same shared workspace.
5. Import course and assessment records: through the nightly Nexus sync, the Drive sync page, or manually.

Never commit secret keys, cookies or tokens. Keep invitation addresses out of source control.
