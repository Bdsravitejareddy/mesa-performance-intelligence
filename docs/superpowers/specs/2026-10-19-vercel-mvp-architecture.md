# Vercel-hosted MVP Architecture

## Intent and constraints

Build a course-grounded academic and professional performance intelligence dashboard as a web application deployed on Vercel, with source code in GitHub. The original repository, detailed A–H module requirements, architecture, deployment model, and LMS API contract were not recovered. Keep all known requirements in `PRODUCT_BRIEF.md`; do not claim this reconstruction is the original project.

The authenticated Mesa LMS remains the intended primary data source. The observed UI exposes courses, assignment work, attendance/grades, and course resources, but no permitted API contract has been verified. The app must not scrape around browser controls or pretend a live sync exists. Daily sync stays disabled until an official/export contract and allowed authentication method are verified.

## Proposed architecture

- **Web app:** Next.js App Router with TypeScript, deployed on Vercel and connected to GitHub. Use server-side route handlers/actions for protected reads and writes; the browser must never receive database, storage, LMS, or model secrets.
- **Database and authentication:** Supabase Postgres and Supabase Auth, using the current `@supabase/ssr` package for request-scoped, cookie-backed Next.js sessions. Apply row-level security to every exposed application table and scope each row to `auth.uid()`. Use full-text search over extracted course-material chunks for the MVP; add embeddings only if demonstrated retrieval needs justify them.
- **Uploaded files:** Private Supabase Storage bucket for course materials and submissions. Store metadata and provenance in Postgres. Enforce user-folder ownership in Storage policies; use short-lived signed URLs only when needed.
- **Evaluation:** A server-side model-provider adapter creates drafts only when a model provider is configured. The provider is not selected or provisioned yet. Keep evaluation disabled until the user configures a provider and agrees that relevant submission/course excerpts may be sent to it. Always retrieve only relevant excerpts. Deterministic TypeScript checks verify supported calculations. Inferred rubrics require review and approval; all three evaluations stay separate.
- **Scheduled work:** Vercel Cron can trigger a daily protected route. Keep it disabled until the LMS connector is verified. Once enabled, implement idempotent incremental sync, failure status, and manual recovery; retain prior source records on incomplete sync.
- **Source control:** Source is pushed to a new private GitHub repository at `https://github.com/ravibussareddy-stack/mesa-performance-intelligence` on branch `work/mesa-performance-dashboard`. The user asked for a push and will deploy manually. Do not reuse an unrelated repository or deploy the production site.

The first workflow is course creation → material upload and extraction/indexing → assessment linkage → rubric draft → submission evaluation → evidence-linked feedback/dashboard. Include entry points for daily marks, SWOT, correlations, resume gap analysis, and objective quality checking. Preserve recovered behaviors only; detailed A–H behavior remains an explicit gap.

## Options considered

1. **Local Python + SQLite + local Ollama.** Keeps course data on one machine and uses installed local models, but it cannot provide the requested always-online Vercel dashboard without adding a separate hosted backend.
2. **Next.js + Vercel + Supabase (recommended).** Fits the requested deployment and Git workflow and combines Postgres, file storage, and authentication. It requires user-configured project URL/keys, auth settings, and model-provider credentials. An existing Supabase project is visible in the connected account, but it is not identified as this application's project and will not be modified without that designation.
3. **Next.js + Vercel + Neon + private Vercel Blob.** Considered initially, then superseded by the user's Supabase preference.

## Data and trust boundaries

Use the minimum Module I entities: Course, CourseModule, CourseMaterial, LearningObjective, Rubric, RubricCriterion, MaterialReference, TopicCompetency, and EvaluationEvidence, plus assessments, submissions, official scores/feedback, sync state, and authenticated-user ownership. Store extracted chunks with document version, page/slide, source reference, and retrieval metadata. Apply authorization checks on every record and file operation. Treat uploaded files, LMS text, and student writing as untrusted input. Do not log submission bodies or marks.

Rubric generation follows the evidence hierarchy. Preserve official rubrics, criteria, weights, and maximum marks exactly; otherwise create a visibly inferred, editable draft and require approval. Produce Mesa Academic, Objective Analytical, and Professional Readiness evaluations independently with cited evidence and explicit uncertainty. Never average them. Compare official marks and feedback by criterion without declaring official marks wrong solely from score differences. Use evidence-weighted mastery states and show coverage/sample limitations in correlations; do not infer causality.

Professional-role benchmarks must be selected and grounded in a user-supplied or otherwise approved role profile. Do not present unsupported industry norms as sourced standards. Course-grounded improvement examples reconstructed by the system must be labeled illustrative.

## Limitations and acceptance boundary

This architecture decision does not recover A–H, prove LMS API permission, establish institutional data-retention/region policy, or choose/provision the hosted model provider. The GitHub repository exists, but no production database, storage bucket, or Vercel deployment has been created. These gaps remain explicit. Daily automated LMS ingestion remains unaccepted until an authorized stable source contract is obtained.

The original acceptance criteria remain authoritative, including PDF/PPTX upload, extraction, source references, rubric generation, deterministic numeric checks, three separate evaluations, mark reconciliation, honest handling of missing evidence, and topic mastery. Deployment itself is not proof that those behaviors or the daily sync are complete.

## Approval status

Updated 2026-10-19 to reflect the user's preference for a Vercel-hosted dashboard, GitHub source code, and Supabase storage. The implementation uses Next.js, Supabase Postgres/Auth/private Storage, and a configurable, disabled-by-default server-side model adapter. The user will deploy manually on Vercel; migrations, RLS/storage policies, and setup guidance are included. No Supabase project has been modified and no Vercel deployment has been created.
