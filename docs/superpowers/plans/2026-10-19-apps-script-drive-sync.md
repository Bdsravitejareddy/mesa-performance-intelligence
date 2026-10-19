# Apps Script Drive Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import selected personal and Mesa Drive folders into the existing shared dashboard automatically after one Apps Script installation per necessary source account.

**Architecture:** A Google-account-owned script lists and exports selected folders, exchanges a one-time pairing code for a connector credential, uploads files directly to private Supabase Storage, and calls bounded dashboard endpoints to index them. Database transactions enforce pairing, import leases, deduplication, and complete-version publication. Google triggers schedule and resume work; Vercel needs no Google refresh token or daily cron.

**Tech Stack:** Existing pinned Next.js/TypeScript, Supabase Auth/Postgres/Storage, Vitest/PGlite, Google Apps Script V8, Drive REST API. No new paid service or runtime dependency.

**Spec:** `docs/superpowers/specs/2026-10-19-apps-script-drive-sync-design.md` (approved by user).

## Global Constraints

- Existing requirements and original A–H gaps remain intact; AI evaluation stays disabled.
- Both approved, verified members share the connection and imported content; outsiders have no access.
- Preserve the existing 20 MB stored-file limit; Google `files.export` has its own 10 MB export limit.
- Import PDF/PPTX and export native Docs/Slides; inventory other types with explicit unsupported status.
- No credentials in source, logs, generated fixtures, or browser bundles. Google credentials stay in Google; the server-only Supabase secret stays in Vercel.
- Run a daily trigger; resume before Google's six-minute execution ceiling. A large first import may span days under quota limits.
- Preserve source IDs, links, versions, page/slide references, and parent course ownership.
- No actual user sign-in emails, production deployment command, deletion of source content, or claims of live sync before actual Google authorisation and trigger verification.
- Read the installed Next.js guides before changing routes/proxy. Use the Supabase skill and current official references for migrations, signed upload URLs, and secret-key usage.

## Review Focus

1. A timeout after upload or database commit must not create duplicate materials or lose the previous version; tested in Tasks 1 and 3.
2. A disabled connector or changed folder mapping must not publish an old in-flight upload; tested in Tasks 1–3.
3. The same file visible through both Google accounts, or through shortcut cycles, must not multiply records or traversal work; tested in Tasks 1, 3, and 4.
4. A 429, permission error, or incomplete root scan must not mark unseen files deleted; tested in Tasks 3 and 4.
5. Source filenames/folder titles and client metadata are untrusted; they must not control upload origins, storage paths, owner IDs, or script source; tested in Tasks 2–5.

## File map

- `supabase/migrations/<CLI-generated>_apps_script_drive_sync.sql`: tables, grants/RLS, service-only atomic RPCs.
- `src/lib/drive-sync/contracts.ts`: source metadata, scan/checkpoint types, limits, validation.
- `src/lib/drive-sync/store.ts`: typed RPC/database boundary; all privileged record access is scoped here.
- `src/lib/drive-sync/auth.ts`: pairing/token generation and connector authentication.
- `src/lib/drive-sync/importer.ts`: reservation, signed uploads, parsing, version publication.
- `src/lib/supabase/admin.ts`: server-only client requiring `SUPABASE_SECRET_KEY`; no persistence of auth sessions.
- `src/lib/drive-sync/script.ts`, `integrations/apps-script/Code.gs`, `integrations/apps-script/appsscript.json`: safe script bootstrap/template, runtime, manifest.
- `src/app/api/drive-sync/connections/route.ts`, `connections/[id]/route.ts`, `connections/[id]/pairing/route.ts`: signed-in management.
- `src/app/api/drive-agent/{pair,session,inventory,upload,finalize,checkpoint}/route.ts`: exact machine-authenticated endpoints.
- `src/app/drive-sync/page.tsx`, `src/components/drive-sync-panel.tsx`: setup/status/folder management.
- Tests under `src/lib/drive-sync/*.test.ts` plus route boundary tests; use actual PGlite transactions and Node VM execution of script logic with Google/network boundary doubles.
- Modify `src/lib/supabase/proxy.ts`, `src/components/app-shell.tsx`, `src/lib/ai/retrieval.ts`, `src/app/courses/[id]/page.tsx`, `.env.example`, and the three project Markdown documents as needed for integration/provenance.

### Task 1: Transactional connection and import state

**Interfaces:** Produce `DriveConnection`, `FolderMapping`, `SourceFile`, `ScanCheckpoint`, `ImportItem`, and `ImportDecision` types in `contracts.ts`. `FolderMapping` contains server-issued ID, Drive folder ID, mode (`course` or `collection`), optional existing course ID, and root-course title. `SourceFile` contains Drive ID, name, MIME, parent/target ID, source URL, version/modification fingerprint, optional size, folder mapping ID, and course-folder ID/title. `ImportDecision` is `unchanged | upload | unsupported | conflict | retry_later` with server-issued item ID where applicable.

`DriveSyncStore` exposes these signatures (use existing `ExtractedPage` from `src/lib/documents.ts`):

```ts
issuePairing(connectionId: string, hash: string, expiresAt: string): Promise<void>;
consumePairing(pairingHash: string, tokenHash: string): Promise<{connectionId: string; userId: string}>;
authenticate(tokenHash: string): Promise<{connectionId: string; userId: string} | null>;
startScan(connectionId: string): Promise<{scanId: string; checkpoint: ScanCheckpoint; mappings: FolderMapping[]}>;
reserve(connectionId: string, scanId: string, source: SourceFile): Promise<ImportDecision>;
publish(connectionId: string, itemId: string, pages: ExtractedPage[], objectSize: number): Promise<{materialId: string; version: number}>;
checkpoint(connectionId: string, scanId: string, value: ScanCheckpoint, completedRootIds: string[]): Promise<void>;
```

- [ ] Write `store.test.ts` PGlite tests for shared members/outsiders, hashed-secret privacy, expired/replayed pairing, concurrent pairing consumption, unique `(drive_file_id, export_format)` source identity across connections, atomic publication rollback, and lease/revocation checks. Assert the previous material survives a failed replacement.
- [ ] Run `npm test -- src/lib/drive-sync/store.test.ts`; confirm failures reflect missing migration/RPC behavior.
- [ ] Create the migration with the Supabase CLI. Add RLS-protected connection/folder/source/import/scan records and private credential records. Include `user_id` and composite course ownership constraints. Keep imported material versions immutable; store `current_material_id` and add nullable source/version references to materials so retrieval can select only current imports while historical evaluation citations remain valid.
- [ ] Implement service-only, security-invoker public RPCs for issuing/consuming pairing, authenticating connector hashes, reserving imports, publishing material/pages, and checkpointing/completing scans. Grant private schema/table access only to `service_role`; revoke RPC execution from PUBLIC/anon/authenticated. Use row locks/unique constraints, fixed search paths, 15-minute single-use pairing expiry, and five-minute import leases. An expired lease is recoverable; successful publication is idempotent. RPCs check enabled connection, invited verified owner, mapping revision, and item ownership inside their transaction.
- [ ] Implement `DriveSyncStore` in `store.ts` with typed methods `issuePairing`, `consumePairing`, `authenticate`, `startScan`, `reserve`, `publish`, and `checkpoint` mapping to those RPCs. Source availability changes only after complete successful root traversal; retain all historical material/submission records.
- [ ] Run the new database tests and existing schema/shared-workspace tests; commit schema, types, store, and tests.

### Task 2: Pairing and signed-in management

**Interfaces:** Consume Task 1 types/store. Produce `createAdminClient(): SupabaseClient`, `requireWorkspaceMember(): Promise<{userId:string}>`, `hashConnectorSecret(raw:string): string`, `requireConnector(request:Request): Promise<{connectionId:string;userId:string}>`, and `consumePairing(code:string): Promise<{token:string;connectionId:string}>`. Generate 32 random bytes per secret and hash with SHA-256; never return stored hashes through management responses.

- [ ] Write `auth.test.ts` and route tests asserting 401 for missing/invalid bearer credentials, denial of revoked/unverified-owner connections, one-time pairing semantics, allowlist enforcement, no Google/Supabase secret in responses, and rejected cross-connection requests. Test malformed bodies, oversized metadata, and both approved member roles.
- [ ] Run the focused tests and observe the expected failures.
- [ ] Implement server-only client, auth helpers, management routes, and `POST /api/drive-agent/pair`. Management creation validates 1–20 folder mappings, Google folder ID/link formats, mode/title/course ownership, and uses the authenticated actor's ID for new standalone records. Route updates verify shared-session access before privileged writes; increment mapping revisions to invalidate stale work. Re-pair/disable revoke the old connector token atomically.
- [ ] Exempt only the six exact machine endpoint paths in `src/lib/supabase/proxy.ts`; each route authenticates itself. Pairing is rate-limited with persisted attempt budgets, 15-minute expiry, and atomic single-use consumption; other endpoints require connector bearer authentication. Cap JSON requests at 512 KiB and batches at 100 entries. Do not exempt interactive management paths.
- [ ] Run route/auth/database tests and `scripts/check-private-access.mjs` against a configured local build; commit the authentication boundary and tests.

### Task 3: Direct uploads, parsing, and source provenance

**Interfaces:** Consume `DriveSyncStore`, `requireConnector`, and existing parsers. Produce `reserveSource(context, source:SourceFile): Promise<ImportDecision>`, `createImportUpload(context,itemId:string): Promise<{signedUrl:string;storageOrigin:string}>`, and `finalizeImport(context,itemId:string): Promise<{materialId:string;version:number;status:string}>` in `importer.ts`. Context is the authenticated connector and server-resolved scan, never a body-supplied owner.

- [ ] Write importer tests for new/unchanged/updated files; the same Drive ID across connections; collection-root/course mappings; unsupported formats; mismatched size/type/path; a 5 MB direct upload; expired leases; revocation after upload; atomic retry after commit; mapping conflict; empty PDF text; and partial scan/permission loss without inferred deletion. Exercise actual parsers and database publication, replacing only Storage/network boundaries.
- [ ] Run the focused tests and verify failures.
- [ ] Implement `session`, `inventory`, `upload`, `finalize`, and `checkpoint` routes. Use server-generated private object paths under the course owner's ID. Return signed upload URLs only for reserved supported items. Verify actual stored bytes, PDF/ZIP signatures, extension/MIME, and 20 MB maximum before parsing. Parse one file per finalisation with `maxDuration=60`, publish atomically, and retain retryable state after timeout; stop automatic retries after three non-transient parse failures until the source changes or the user retries it.
- [ ] Validate canonical Drive source URLs from file IDs; escape all displayed metadata. Add source inventory statuses and counters distinct from extraction success. Mark all-empty extraction `needs_visual_review`; do not infer OCR success, official rubric criteria, marks, or assessment links.
- [ ] Update course material displays with original source links/version/status, and retrieval to include the current imported version plus manually uploaded material. Continue resolving old references for saved evaluations. Test current-only retrieval without deleting historical citations.
- [ ] Run importer, retrieval, existing document, and security tests; commit routes, importer, provenance changes, and tests.

### Task 4: Automatic Apps Script agent

**Interfaces:** Produce `install()`, `syncDrive()`, `resumeDrive()`, and `uninstallTriggers()` in `Code.gs`. Its only bootstrap settings are canonical dashboard URL, expected Supabase origin, and one-time pairing code; long-term connector token lives in Script Properties. Protocol uses Tasks 2–3 endpoints, metadata types, and server checkpoints.

- [ ] Write `apps-script.test.ts` with a Node VM harness. Assert exactly one daily trigger after repeated installation, no leaked token, native Doc/Slides export formats, direct binary Storage uploads, shared-drive pagination, shortcut-cycle detection, retry/backoff, preserved page position after a failed batch, and no skipped/unseen deletion after partial scans.
- [ ] Add tests for an interrupted run resuming before six minutes, continuation-trigger deduplication/removal, daily budget rollover, malicious upload URL/redirect, malformed responses, filenames containing script delimiters, and a consumed bootstrap code with an already installed token.
- [ ] Run the focused tests and observe failures.
- [ ] Implement the agent and manifest using Drive REST calls plus `ScriptApp.getOAuthToken()` only for Google origins. Declare Drive read-only, external-request, and trigger-management scopes; include the Drive advanced-service declaration so the default Apps Script project's Drive API is available. Verify the setup against current Google docs; disclose any actual API-enablement step rather than hiding it.
- [ ] Use a script lock, a 240-second work deadline, a maximum 30-minute daily execution budget, and at most one temporary continuation trigger after 60 seconds. Persist traversal/page tokens and pending file progress server-side. Metadata batches are at most 100 entries; visited IDs and traversal queues stay server-side. Register the daily trigger only once, and start the first import automatically after successful installation. Retry transient errors at most three times with capped exponential backoff; honour Retry-After within remaining budget. Advance the checkpoint only after acknowledged processing.
- [ ] Store runtime budget/day and connector credential in Script Properties, validate all upload destinations against the configured Supabase origin, disable redirect following on credentialed network calls, and never log credentials or document text. Resolve shortcut targets with permissions/resource keys and `supportsAllDrives` flags where applicable.
- [ ] Run VM/contract tests, then full tests; commit the agent, manifest, and safe JSON-based bootstrap renderer in `script.ts`.

### Task 5: Dashboard setup and operational status

**Interfaces:** Consume management APIs and Task 4 renderer. Produce `/drive-sync` page and `DriveSyncPanel({connections,courses,configured})`, with forms for source account label, root mappings, disable/re-pair, and one-time setup download. Display 15-minute pairing expiry and distinguish never paired, active, paused, failed, partial, and completed states.

- [ ] Write UI/render and management-route tests proving both invited accounts see the same connections; no persisted credentials render; dynamic script settings cannot inject executable code; folder edits do not require reinstalling; unavailable sources and unsupported files are visible; and demo/missing-secret mode cannot create live connectors.
- [ ] Run the focused tests and verify failures.
- [ ] Implement the page/panel and navigation entry with existing styles. Provide explicit one-time instructions: create a standalone script in each necessary Google account, paste code and manifest, run `install()`, approve Google consent. State that authorisation covers read-only Drive scope while the importer processes only configured roots. Keep script content private and pairing codes out of caches, URLs, and logs. Status polls show progress without retriggering imports.
- [ ] Update `.env.example` with server-only `SUPABASE_SECRET_KEY`; update README, PRODUCT_BRIEF, AGENTS, and IMPLEMENTATION_STATUS with Apps Script workflow, setup, supported formats, preserved source boundaries, and actual completion state. Record the user's confirmation that both dashboard logins work. Do not label scheduled imports live yet.
- [ ] Run tests, lint, production build, `git diff --check`, and local HTTP authentication checks. Verify no server secret is in client output. Commit the UI, docs, and tests.

### Task 6: Review, GitHub release, and real installation acceptance

**Interfaces:** The complete local integration, migration, generated agent, deployment secret, and authorised user installations.

- [ ] Review the complete diff against all ten acceptance checks in the approved spec; run the full test suite once more only if review changes warrant it. Obtain whole-branch code review using the execution method selected by the user, resolve findings, and verify fixes.
- [ ] Apply only the new migration to Mesaintelligence (`wlxvemtseidmxvmnfoao`), preserving existing schema/data/invitations. Run security advisors and live read-only policy checks. Obtain the project's server secret through the authorised Supabase connection and set it only in the existing Vercel project's production secrets; never print or commit it. If permissions prevent this, report the exact missing setup rather than building a client-key workaround.
- [ ] Scan staged changes for credentials/private data and push the reviewed branch to the user's GitHub repository. Let its existing integration deploy; do not issue a production deploy command. Verify deployment commit/state and unauthenticated page/API protection. Machine routes must reject missing/wrong tokens without reaching privileged work.
- [ ] Give the user the live Drive sync URL for initial folder configuration and Google installation. User consent and folder links are required; do not fabricate them. Use a synthetic connection only in local tests, not production student records.
- [ ] After authorisation, verify a real file's source ID/version, stored object, indexed pages, shared visibility, unchanged re-scan, and next automatic trigger. Update implementation status with precisely the checks completed, and leave live scheduling pending until that trigger is observed. Push any final documentation changes.

## Plan self-review

The tasks cover pairing/revocation/RLS (1–2), direct upload and atomic versioning (1,3), folder ownership and provenance (1,3,5), shared drives/shortcuts and automatic quota-aware execution (4), source unavailability and errors (1,3–5), user setup/status (5), and real release/trigger verification (6). All five Review Focus conditions have explicit tests. No dependency upgrade, AI provider enablement, manual daily action, or recovery of missing A–H details is required by this integration. Implementation and real Google authorisation remain pending review of this plan.
