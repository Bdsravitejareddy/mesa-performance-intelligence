# Project guidance for agents

## Preserve product requirements

- Treat `PRODUCT_BRIEF.md` as the product source of truth.
- The original A–H specification is not present. Preserve all recovered requirements and do not claim the missing details have been reconstructed. Ask for the original source when a change depends on an unknown rule.
- Keep daily marks ingestion, SWOT, correlations, resume gap analysis, and the objective quality checker in scope while building Module I.
- Course-grounded evaluation is P0. The minimum workflow is course upload, extraction, assessment linkage, rubric generation, submission evaluation, evidence-linked feedback, and dashboard.

## Data integrity and evaluation

- Distinguish official faculty criteria from AI-inferred rubrics. Preserve official criteria, weights, and maximum marks.
- Keep Mesa academic, objective analytical, and professional readiness evaluations independent; never average them automatically.
- Do not claim official marks are wrong because an AI score differs. Show the criterion, source evidence, and reason for a discrepancy.
- Cite course material by document, version, and page/slide reference. Label reconstructed examples as illustrative.
- Do not penalize a valid alternative method unless the assessment explicitly requires a particular approach.
- Use deterministic calculations where possible. State when missing data or assumptions prevent verification. Do not infer causality from correlations.
- Weight mastery evidence by coverage and quality; one weak assessment is not proof of lack of mastery.
- Course marks and grading use a 0–100 scale. Preserve the official score out of 100 and its provenance; do not apply extra normalization. Preserve official rubric weights/maxima independently if their internal total differs, and show that rubric result separately.

## LMS sync and security

- Treat the authenticated Mesa LMS as the primary source for course and assessment data. Use the official Nexus MCP server at `https://students.mesaschool.co.in/mcp`; do not scrape around controls or bypass authentication, access controls, or rate limits.
- The service token is stored only in Vercel's server-side `NEXUS_MCP_TOKEN`; never retrieve it into local files, logs, browser code, screenshots, fixtures, or Git. It is revocable and expires within the LMS's 7–90 day policy, so sync failures must remain visible and token rotation may be required.
- Run synchronization once daily through Vercel Cron, protect it with server-only `CRON_SECRET`, make it idempotent, record source/timestamps, and surface errors for review. The signed-in manual recovery route must recheck invited workspace membership.
- Only explicit earned-score fields count as official student marks. Do not mistake maximum marks, available marks, status labels, or an unpublished gradebook for an earned score. Preserve the confirmed 0–100 scale and label imported feedback as official LMS feedback.
- **Member-approved exception (2026-10-23):** the student explicitly approved a supervised, read-only import through their own signed-in browser of (a) submitted files and links shown on Nexus assignment pages, which the MCP does not return, and (b) their own results in the Cohort 4 Quiz Tool and Campus Hub. Only read and download what the student can already see; never submit, answer, edit, or interact with open questions; never automate this server-side or store their session. Keep these as separately labelled sources, never as official LMS marks.
- Never call MCP write, submit, grade, or delete tools. Skip list tools with required identifiers that cannot be populated from trusted LMS IDs; do not guess tool arguments. An MCP handshake alone is not proof of successful import. Verify actual structured records, known released marks, feedback, and a later scheduled run before claiming the sync works.
- Never commit passwords, cookies, access tokens, refresh tokens, or other secrets. Use a secure OS credential store or deployment secret manager once the supported auth mechanism is confirmed.
- Request only the minimum data required for the requested student and features. Keep private student data out of logs and examples.

## Apps Script Drive sync

- `/drive-sync` manages shared source-account labels, course/collection roots, private expiring installers, re-pair/disable, and inventory status. Both approved dashboard logins have been confirmed working; never add their actual email addresses to tracked docs or fixtures.
- Selected roots are the import boundary; Google read-only Drive consent covers the installing account. Preserve link resource keys through mapping validation, storage, first root checkpoint, and Drive requests. Routine folder edits require no reinstall.
- Connector and pairing secrets are hashed server-side. Only Script Properties hold the installed token; do not persist setup credentials in browser storage, URLs, caches, logs, or tracked files. Generate installers only from canonical deployment origins (`APP_BASE_URL`, or Vercel's production-origin variable), never request Host headers.
- Background work needs server-only `SUPABASE_SECRET_KEY`. Interactive management must authenticate membership and resolve connection access through session RLS before privileged reads/writes. Status polling is read-only and must not call agent session/import endpoints.
- Preserve current and historical material versions; failed/partial roots never establish deletion. Unsupported inventory, unavailable sources, empty extraction, visuals, size/export limits, and parse failures must be reported honestly. Resetting a three-failure source enables its next scheduled retry; it does not execute an import.
- Reserve the full six-minute platform lifetime before each cloud invocation. Record actual elapsed runtime when `finally` executes; forced termination must retain its reservation. Keep the daily allowance bounded and preserve checkpoints on quota exhaustion. Renew matching owned leases when resuming, and retry upload/finalize lease conflicts without dropping queued files. Distinguish per-file review warnings from a failed scan.
- Resume an already uploaded private object through authorized finalization and its lease/content checks. Never enable object overwrites to recover an interrupted transfer. Preserve queued work if the finalization lease has expired.
- Keep local implementation, released schema/secrets, Google authorisation, initial import, unchanged re-scan, shared visibility, and later automatic trigger as distinct acceptance stages. Do not claim live Drive scheduling before actual user consent and trigger observation. AI and LMS ingestion gates stay intact.

## Course documents and retrieval

- Preserve filenames, versions, document references, and page/slide numbers through parsing and evaluation.
- Extract useful tables and provide visual interpretation for meaningful diagrams, charts, and images.
- Use local parsing and lightweight indexed retrieval (SQLite FTS is the MVP default). Retrieve relevant excerpts rather than full course documents for an evaluation.
- Cache parsed material, embeddings if used, and evaluation results. Do not add a paid vector database without demonstrated need.

## Repository and implementation

- The original repository and stack were not found. Do not imply the reconstructed workspace is the original implementation.
- Before selecting a runtime, database deployment model, or UI framework, recover the source repository or document and review the decision in the implementation plan.
- Keep product requirements, implementation status, and discovered LMS integration contracts synchronized with code changes.
- Do not put LMS credentials or session data in source files, fixtures, screenshots, or committed logs.
- The user prefers a Next.js dashboard for manual deployment on Vercel, source in GitHub, and Supabase for database/file storage. Keep student and course data private by default and enforce RLS/ownership on every data and file operation.
- The user selected **Mesaintelligence** in **Ravi Org** (`wlxvemtseidmxvmnfoao`). Its migrations are applied; do not touch the unrelated “Ravi Project.” Two approved email addresses have equal access to one shared workspace. Keep the app's `APP_ALLOWED_EMAILS` and the private database invitation list aligned; never authorize using editable user metadata.
- Workspace RLS grants access only to verified invited Auth users. Course-dependent inserts must inherit the parent record's `user_id`, preserving composite foreign keys when either approved account contributes. Keep invitation addresses and credentials out of source control.
- Never expose model, database, storage, auth, or LMS credentials to browser code. Keep AI evaluation disabled until a server-side provider is configured and excerpt handling is approved.
- Do not modify an existing Supabase project unless the user identifies it as this app's project. Do not deploy production; the user will deploy manually. Push source to a private GitHub repository only after local implementation is reviewable; never push secrets or student data.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
