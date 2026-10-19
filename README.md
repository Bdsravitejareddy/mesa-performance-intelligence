# Mesa Performance Intelligence

A reconstructed academic and professional performance dashboard. The original project and detailed A–H requirements were not present in the workspace; see `PRODUCT_BRIEF.md` and `IMPLEMENTATION_STATUS.md` for recovered scope and gaps.

## Run locally

Use Node.js 22.13 or newer.

```sh
npm install
cp .env.example .env.local
npm run dev
```

The default local preview uses clearly labeled synthetic examples. To use a private workspace, set `NEXT_PUBLIC_DEMO_MODE=false` and configure the Supabase values below. Never use real LMS/student data in preview mode or commit `.env.local`.

## Supabase setup

1. The configured project is **Mesaintelligence** in **Ravi Org**, reference `wlxvemtseidmxvmnfoao`. Its schema and private file bucket are installed. Select the intended target explicitly before applying migrations elsewhere.
2. Copy the project URL and publishable key into the local environment and the Vercel project's environment variables.
3. Link the CLI to the selected project and apply the migration:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

4. Set `APP_ALLOWED_EMAILS` to the comma-separated approved login emails. The legacy singular `APP_ALLOWED_EMAIL` remains supported. Add the same normalized emails to `private.workspace_access` using trusted database administration; this invitation table is not readable or writable by application users. The first requested magic link creates an account, and a verified invited account can share all workspace records with the other invited account.
5. Configure the Auth Site URL and callback using the minimal production configuration in `deploy/supabase/config.toml`. Other project properties are left unchanged. The Mesa production URL and callback have already been configured.
6. Keep the `course-files` bucket private. The migration creates it with a 20 MB limit and verified-workspace-member policies.

The migrations enable RLS on every application table and restrict records/files to verified, explicitly invited workspace accounts. Both approved accounts have equal access to the same records. Child records retain their course/assessment owner's ID so contributions from the second account preserve foreign-key integrity. The invitation lookup runs in a private schema with a fixed search path and reads verified Auth email addresses, never editable user metadata. No service-role key is used in the app. The separate “Ravi Project” has not been modified.

## Vercel deployment

The repository is intended for deployment by the user. Connect the private GitHub repository to Vercel, add the environment variables below to the relevant deployment environments, and deploy. No Vercel project is created by this codebase.

Required for a private workspace:

- `NEXT_PUBLIC_DEMO_MODE=false`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `APP_ALLOWED_EMAILS`

If the deployed site has no data, first check these variables in the Vercel environment used by its production deployment and redeploy after saving them. Applying the Supabase migration creates the schema, not student records. Course materials and official assessment records must then be added or imported. A Chrome LMS session is not available to Vercel, and automated LMS sync is not connected. Do not enable demo mode to represent real student results.

AI rubric drafting and evaluation are disabled by default. The optional `AI_API_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, and `AI_DATA_PROCESSING_APPROVED` settings are server-only. The provider code sends at most eight retrieved page/slide excerpts plus the selected submission and official feedback; it never sends an entire course document. Keep approval false unless you have explicitly approved that data flow and reviewed the provider's data handling. Without all four settings, no AI call is made.

`CRON_SECRET` is reserved for an authorized LMS integration. Daily sync is disabled because no permitted stable LMS interface or persistent authentication contract has been verified.

## Current capabilities

- Create courses and assessments with a 100-point official marks scale.
- Upload PDF/PPTX course material to private Supabase Storage; extract PDF text and PPTX text/tables, retain page/slide references, and index extracted text in Postgres full-text search.
- Link course material to an assessment and add visual notes for slides flagged as containing diagrams or images.
- Enter submission text, official marks, and feedback manually.
- Record official rubrics with their original weights and maximum marks, or request course-grounded inferred rubrics for review, editing, and approval.
- Request separate Mesa academic, analytical, and role-based evaluations with retrieved citations, deterministic arithmetic checks, and feedback reconciliation when the guarded provider is enabled.
- Record evidence-linked SWOT entries, review descriptive official-mark averages by format, run a local phrase-match resume helper, and perform local structure/arithmetic checks.

Evaluation reports are cached against the exact submission, official feedback, rubric, and selected role profile so unchanged work does not trigger a repeat provider call. The quality checker and resume phrase helper run in the browser and do not save or transmit pasted drafts. Their limitations are shown in the UI. Synthetic preview data is explicitly labeled. Professional scoring remains unavailable until a user-supplied role profile is selected.

## Validation

```sh
npm test
npm run lint
npm run build
```

## LMS source

The Mesa LMS remains the intended primary data source. Current UI observations are documented in `IMPLEMENTATION_STATUS.md`; they are not an API contract. Do not scrape around browser controls, store credentials/session tokens, or enable daily sync until a documented/permitted source interface and authentication method are confirmed.
