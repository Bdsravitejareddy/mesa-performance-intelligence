# Scheduled Google Drive imports through Apps Script

Status: proposed design for user review; no importer or trigger is implemented yet.

## Purpose and agreed direction

The user wants Drive integration in the existing dashboard without downloading files or manually running an import each day. Materials are split between personal Drive and Mesa/shared folders. The user is willing to install and authorise Google Apps Script once.

Use a standalone script running under the source Google account to push selected course folders into the existing private Supabase workspace. Each distinct source account needs an installation only if its materials are inaccessible to the other account. Both dashboard accounts retain equal access to imported records. Existing product requirements, the Module I workflow, and LMS work remain intact.

This is a new ingestion subsystem. This document is the architectural design review artifact, not an implementation completion claim. No changes to production or Google accounts occur during this review.

## Choice of approach

- **Selected: scheduled Apps Script pushes.** Source-account authorisation, daily triggers, no personal OAuth refresh credentials on Vercel, and no Google Cloud OAuth client setup for the dashboard. Requires an initial script installation and Google consent.
- Dashboard OAuth pull remains an alternative if Apps Script is blocked by the institution. It requires a Google Cloud client and durable refresh credential management.
- A service account remains an alternative where the user can share all relevant folders. It is less suitable for mixed folders the user cannot reshare.

The Apps Script installation must be allowed by the school account's policies. It can only retrieve files the executing account can access and export. Neither the existing assistant Drive connection nor dashboard login grants the script access.

## User workflow

1. Open a new **Drive sync** dashboard page while signed in.
2. Add one or more source folder links. Each root is configured once either as a course folder or as a collection whose immediate subfolders represent courses. Use existing courses where explicitly linked; otherwise create courses from folder names, preserving source IDs.
3. Create a connector and receive a short-lived, single-use pairing code plus the script source and manifest. No database or storage secret appears in the generated files.
4. Create a standalone Apps Script project in the Google account that can read those folders, paste the supplied files/configuration, and run `install()` once. Approve Google's requested permissions.
5. Installation exchanges the pairing code for a revocable connector token, stores it in private Script Properties, validates folder access, creates exactly one daily trigger, and starts the first import. Re-running installation must not duplicate triggers or connections.
6. Thereafter Google runs the script automatically. The dashboard shows connection status, last successful scan, imported/unchanged/failed counts, and specific file errors. It supports disabling/re-pairing a connection. No browser tab or local computer must remain running.

Folder configuration is downloaded from the dashboard on each run. Routine folder changes must not require editing script code. No per-file course assignment or daily approval is required. Files directly under a collection root are attached to an explicitly named root course, rather than guessing a course from their contents.

## Scope and file handling

- Recursively list configured roots using Drive REST calls from Apps Script with the account's OAuth token. Request read-only Drive access and only the script/network permissions needed for installation and upload. Include explicit shared-drive support; do not depend solely on DriveApp for shared-drive traversal.
- Follow folder/file shortcuts only after resolving target permissions. Maintain visited target IDs to prevent cycles and duplicate traversal. Report inaccessible targets without blocking other folders.
- Import PDF and PPTX files; export Google Docs to PDF and Google Slides to PPTX automatically. Preserve original Drive URL, file ID, source account/connection, parent folder, MIME type, modification/version fingerprint, export format, and page/slide references.
- Preserve the existing 20 MB stored-file limit. Google's `files.export` has its own 10 MB export limit. Oversized or non-exportable files receive a visible exception, not a silent truncation.
- Legacy PPT, DOCX, Google Sheets, recordings, and other unsupported types appear in the source inventory with an explicit unsupported status. Structured spreadsheet/grade ingestion and additional formats remain subsequent work, not claims of this first import workflow.
- Use the existing deterministic PDF/PPTX parsers and full-text index. Empty text and detected visuals require honest extraction status. OCR and automatic diagram interpretation remain unimplemented; importing an image-only PDF is not evidence that its contents were understood.
- Uploaded official rubrics remain labelled source documents. Do not invent official criteria, marks, assessment links, or learning objectives from filenames. AI evaluation stays disabled under the existing configuration gate.

## Authentication and isolation

- Interactive connector management uses existing Supabase sessions, allowlist checks, and verified-member RLS. Either approved member can manage the shared workspace's connectors.
- Pairing codes have cryptographic entropy, hashed server-side storage, a short expiry, and atomic single-use consumption. Connector tokens are high-entropy bearer credentials; store only hashes server-side, and the token in the script's private Properties. Never log either credential or embed them in the repository.
- Connector authority permits source inventory, uploads, finalisation, and status reporting for that connector only. It does not permit querying submissions, modifying official marks, reading arbitrary files, or accessing other workspaces.
- Background endpoints authenticate their connector credential directly; the browser-session proxy exempts only their exact paths. Unauthenticated, expired, revoked, mismatched, or replayed pairing requests fail closed.
- A server-only Supabase secret key is required for the background worker's database/storage operations. Store it in deployment secrets. It is never returned to the script or browser. All privileged operations explicitly enforce connector, workspace, parent course ownership, and fixed bucket/path constraints.
- The script never sends its Google OAuth token to the dashboard. It uses that token only with Google endpoints. Upload URLs returned by the dashboard must match the configured Supabase origin, with no arbitrary destination redirects.
- Disabling a connector immediately stops new authenticated requests. Previously issued signed URLs expire naturally; uploads from a revoked connector cannot be finalised or indexed. Do not delete existing course records when disabling a connection.

## Transfer and persistence

1. Start/resume a scan, obtain folder configuration and a bounded traversal checkpoint.
2. Send a small metadata batch. Server identifies already imported versions and returns work only for changed or new files. Workspace-level Drive IDs deduplicate files visible through both accounts. Conflicting root/course mappings are reported with the existing assignment retained.
3. For each changed file, reserve an import item and request a short-lived signed upload URL for its fixed private Storage path.
4. Upload bytes directly from Apps Script to Supabase using UrlFetchApp. Binary payloads do not pass through Vercel's smaller function request-body limit.
5. Finalise by import-item ID. Verify the stored object's path, size, file type, reserved source identity, and connector before parsing. Do not accept a client-supplied arbitrary URL or owner ID.
6. Persist material/version metadata and page records atomically through a narrowly scoped database function. A failed update preserves the previous complete version. Deterministic unique source keys make retries safe.
7. Finish or checkpoint the scan and publish counters/errors. A successful scan of metadata is distinguished from successful extraction of every file.

Add minimal connector, folder mapping, source/import-item, and scan/checkpoint records alongside existing `courses`, `course_materials`, `material_pages`, and `sync_runs`. Secret hashes/pairing records live in a private schema without direct application-user grants. Public connection/status metadata uses shared verified-member RLS. Import records inherit the parent course owner to preserve existing composite foreign keys.

Deleted or newly inaccessible source files are marked unavailable only after a complete successful traversal of their configured root. Failed or partial scans must not imply deletion. Keep previously imported versions and source history. Source deletion must never silently erase official marks or submissions.

## Scheduling, quotas, and failure recovery

- `install()` creates one time-driven daily trigger under the installing account; Google chooses its execution window. No exact-minute guarantee.
- Use a script lock to prevent concurrent runs. Stop work before Google's six-minute execution ceiling, persisting traversal state server-side rather than storing an entire Drive inventory in Script Properties.
- Large backlogs resume through a single temporary continuation trigger, which is removed when caught up. This continues the same daily scan; it does not require manual runs or overlapping full scans.
- Respect daily trigger-runtime/network quotas with bounded batches and a daily budget. On exhaustion, preserve the checkpoint for the next automatic daily run. Do not promise an arbitrarily large initial library can finish in one day.
- Back off on Google/server 429 and transient 5xx responses. Keep per-file errors and retry state; a blocked file must not stop unrelated imports. Authentication revocation or institution policy blocks are actionable connection errors.
- Each Vercel parsing request handles at most one file, with a platform-supported duration cap, a recoverable import lease, and idempotent completion. A timeout leaves a retryable item. Repeated parse failures become visible exceptions rather than an infinite retry loop.
- App-specific status reporting sends no emails or messages. Google's own trigger failure notifications are outside the dashboard's control.

## Acceptance checks

1. One approved account pairs a connector; both approved dashboard accounts see its status and imported content; outsiders cannot manage it.
2. Pairing expires, cannot be consumed twice, and a revoked token cannot reserve or finalise an upload.
3. A PDF and PPTX import produces real indexed pages with source references. Google Doc/Slides exports use correct destination types.
4. A repeated unchanged scan creates no duplicate material. An updated file records a new version while retaining earlier provenance. The same Drive ID visible through both source accounts does not duplicate records.
5. Parent ownership, folder mapping, bucket/path validation, object size/type, and cross-connector isolation hold for both members.
6. A file larger than Vercel's request-body limit uploads directly to Storage and indexes within the supported 20 MB limit; oversized and unsupported files are surfaced explicitly.
7. A simulated multi-run backlog resumes from a checkpoint without losing or duplicating work. Installation and retries create no duplicate triggers.
8. Permission loss, inaccessible shortcuts, Google export limits, 429 responses, parser errors, and partial scans report honest results without deleting prior data.
9. Existing authentication, rubric/evaluation, document extraction, and shared-workspace regression tests still pass; lint and production build pass.
10. Live acceptance requires the user to authorise the script and supply actual folder links. Record a successful initial import and a subsequent automatic trigger before claiming daily sync is operational. Local tests alone cannot verify school policies or actual trigger execution.

## Setup dependencies and practical limits

The user must approve Google consent and run the installer once in each necessary source account. Actual folder links are still needed. The deployment requires the new schema and server-only Supabase secret; no new Google Cloud OAuth client, paid vector database, manual daily job, or Vercel cron is needed for this approach.

LMS marks and evaluator feedback remain separate unless present in a supported source. The Apps Script integration does not grant access to Mesa LMS sessions or enable AI processing.

## References checked

- [Installable triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [DriveApp and shared-drive guidance](https://developers.google.com/apps-script/reference/drive/drive-app)
- [Drive downloads and exports](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)
