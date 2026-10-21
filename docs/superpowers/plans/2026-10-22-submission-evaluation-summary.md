# Submission Evidence and Personalized Evaluation Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link real student submission content to course evidence and provide separate evidence-backed evaluation layers plus an AI summary of strengths, priorities, and next actions.

**Architecture:** Reuse the existing Supabase submission, evaluation, evidence, retrieval, and private Storage patterns. First verify whether the authorized LMS MCP exposes submission attachment references or downloads; never infer a missing API or scrape the LMS. Provide private upload and existing Drive/course-material linking fallbacks, then evaluate extracted work against only retrieved excerpts.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Auth/Postgres/private Storage, existing PDF/PPTX parsers, configured server-side AI adapter, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-personalized-healthtech-coaching-design.md`

## Global Constraints

- Official course marks remain on 0–100; preserve original earned score, maximum, source, and feedback.
- Keep Mesa Academic, Objective Analytical, and Professional Readiness results separate; never average them automatically.
- Official rubric criteria, weights, and maxima remain authoritative; inferred rubrics must be labeled and approved.
- Deterministically verify calculations wherever possible; do not claim an official mark is wrong from a score difference alone.
- Cite course document/version/page or slide for major findings; mark reconstructed examples illustrative.
- Retrieve only relevant course excerpts, keep provider calls server-side, and do not log student work.
- Do not enable hosted AI until the provider is configured and excerpt handling is explicitly approved through the existing server-only gate.
- Preserve all legacy features and unknown original A–H requirements; do not invent missing rules.

## Review Focus

- LMS returns metadata without supported attachment content: show the limitation and keep submission text empty until the user links/uploads a file.
- A malformed, oversized, or unsupported uploaded file: reject it without creating a dangling submission document.
- AI returns invalid scores, unknown citations, unsupported claims, or missing summary sections: save nothing and show a safe error.
- A user has no official rubric or relevant course excerpts: block scored evaluation and explain the required next step.
- The same submission is evaluated again after its text, rubric, course source, feedback, or role version changes: the old result must not be returned as current cache.

---

### Task 1: Verify and model submission document access

**Files:**
- Modify: `src/lib/lms/mcp-client.ts`, `src/lib/lms/tool-selection.ts`, `src/lib/lms/sync.ts` only for capabilities actually present in the official MCP schema.
- Create: `src/lib/lms/submission-documents.ts` and `src/lib/lms/submission-documents.test.ts`.
- Create: `supabase/migrations/20261022090000_submission_documents.sql` and matching migration/schema test coverage.
- Update: `IMPLEMENTATION_STATUS.md` with the observed attachment contract or explicit absence.

**Interfaces:**
- Consumes: authenticated official Nexus MCP tool inventory and existing `submissions`/`course_materials` records.
- Produces: `resolveSubmissionDocuments(record: unknown): { status: "available" | "unavailable"; references: SubmissionDocumentReference[] }`, where each reference contains a trusted source kind/id, filename, MIME type, source URL when present, and version; it never fetches arbitrary URLs.
- Produces: private `submission_documents` records linked by `(submission_id,user_id)`, with source kind (`lms`, `drive`, `upload`), file metadata, private storage path or source reference, extracted text, extraction status, and source version.

- [ ] **Step 1: Write failing tests** for recognized supported MCP attachment fields, metadata-only assignments returning `unavailable`, rejected arbitrary URL fields, 20 MiB upload boundary, PDF/PPTX MIME allowlist, and cross-user foreign-key/RLS isolation.
- [ ] **Step 2: Run focused tests** with `npm test -- src/lib/lms/submission-documents.test.ts src/lib/lms/tool-selection.test.ts`; expect failures for the missing resolver/table contract.
- [ ] **Step 3: Inspect the live official MCP tool schema and one authorized assignment detail** without recording credentials or student file contents. Update the status contract from observed fields only. If no supported attachment endpoint exists, keep the result explicitly unavailable.
- [ ] **Step 4: Implement the pure resolver and additive private schema**; do not call URLs supplied by record content. Reuse existing workspace membership RLS and make `(submission_id,user_id)` the parent ownership boundary.
- [ ] **Step 5: Run focused tests** and verify the migration with the repository's schema test suite.
- [ ] **Step 6: Commit** as `feat: model linked submission documents`.

### Task 2: Add private upload and linked-document submission flow

**Files:**
- Modify: `src/components/submission-form.tsx`, `src/app/api/submissions/route.ts`, `src/app/courses/[id]/page.tsx`.
- Create: `src/app/api/submissions/[id]/documents/route.ts` and route tests; create focused submission-document UI tests.
- Reuse: `src/app/api/materials/extract/route.ts`, `src/lib/documents.ts`, and private Supabase Storage.

**Interfaces:**
- Consumes: `SubmissionDocumentReference` and the Task 1 `submission_documents` table.
- Produces: authenticated upload/link actions that persist a document only after ownership, file-size, MIME, extraction, and assessment/course linkage checks pass.

- [ ] **Step 1: Write failing route/UI tests** for PDF and PPTX upload, choosing an already indexed Drive/course material, rejecting mismatched assessment/course IDs, unsupported MIME, oversize input, anonymous access, and cleanup on extraction failure.
- [ ] **Step 2: Run those tests** and confirm failures reflect missing document handling.
- [ ] **Step 3: Implement route validation and persistence** using a private object path scoped to `user_id`; accept PDF/PPTX files up to 20 MiB. For Drive links, resolve only a source already visible through the authenticated workspace RLS query. Do not accept a free-form fetch URL.
- [ ] **Step 4: Extend the submission form** to attach a local file or select an eligible linked material, and show filename, source, extraction status, and remove action. Keep direct text input available.
- [ ] **Step 5: Run focused tests** plus `npm run lint`.
- [ ] **Step 6: Commit** as `feat: attach private submission evidence`.

### Task 3: Validate and persist evidence-backed summary output

**Files:**
- Modify: `src/lib/ai/contracts.ts`, `src/lib/ai/contracts.test.ts`, `src/app/api/evaluations/route.ts`.
- Create: `supabase/migrations/20261022090004_ai_processing_consents.sql`, `supabase/migrations/20261022090006_dashboard_insight_summaries.sql`, `src/app/api/ai-consent/route.ts`, `src/app/api/ai-consent/route.test.ts`, `src/app/api/insights/summary/route.ts`, `src/app/api/insights/summary/route.test.ts`, `src/lib/ai/summary-context.ts`, `src/lib/ai/summary-context.test.ts`, and focused evaluation route tests.

**Interfaces:**
- Produces `EvaluationPayload.summary` with `strengths`, `improvements`, and `actions`; each item contains `title`, `detail`, `sourceRefs: string[]`, and confidence (`high | medium | low | insufficient`). Meaningful improvement findings also contain `whatStudentDid`, `courseExpectation`, `whyIncomplete`, `illustrativeExample`, `rubricAlignment`, and `professionalApplication`.
- Produces `buildInsightSummaryContext(records: InsightSourceRecord[]): InsightSummaryContext`, aggregating official marks/feedback and saved evidence-linked evaluations with source keys and sample counts; excludes raw personality answers, contact notes, and unsupported inferences.
- Produces `POST /api/insights/summary`, which returns or creates a cached whole-workspace summary with the same three sections and source-linked claims.
- Consumes: extracted submission text, official or approved rubric, official feedback/mark, `retrieveRelevantReferences`, deterministic arithmetic results, and an optional saved role profile.

- [ ] **Step 1: Add failing contract/context tests** for a complete valid summary, missing section, unknown source key, empty unsupported claim, overlong content, missing course-grounded improvement example, score-range violations, evidence/sample count aggregation, exclusion of private/unapproved data, and absent current-user processing consent.
- [ ] **Step 2: Run** `npm test -- src/lib/ai/contracts.test.ts`; confirm the new response contract fails.
- [ ] **Step 3: Extend `validateEvaluation`** to require bounded summary arrays, non-empty evidence citations for substantive claims, and only supplied reference keys. Permit an `insufficient` confidence entry to explain absent evidence without inventing a score.
- [ ] **Step 4: Write failing consent-route tests** for anonymous get/update, missing provider configuration, current consent, stale disclosure version, revocation, and persistence of provider host/model without API keys.
- [ ] **Step 5: Add the consent migration and API route**. The route reports provider hostname, model, and server-configured `AI_DATA_RETENTION_NOTICE`; disable consent/evaluation if this notice is absent. `POST` records agreement to a fixed disclosure version and `DELETE` revokes it. Provider keys remain server-only.
- [ ] **Step 6: Extend the evaluation route prompt and cache input hash** to include the attached submission text/version and all evidence-changing inputs; require both the user's current consent and existing environment gate before provider calls; persist the summary and improvement examples in the existing JSON report.
- [ ] **Step 7: Add evaluation/summary route tests** for missing consent (provider not called), revoked consent, missing rubric/references, invalid provider output (no saved report), cache hit, cache invalidation after evidence change, insufficient evidence, and source citations persisted to `evaluation_evidence` or the summary report.
- [ ] **Step 8: Run** `npm test -- src/lib/ai/contracts.test.ts src/lib/ai/summary-context.test.ts src/app/api/ai-consent/route.test.ts src/app/api/evaluations/route.test.ts src/app/api/insights/summary/route.test.ts src/lib/ai/retrieval.test.ts` and `npm run lint`.
- [ ] **Step 9: Commit** as `feat: generate evidence-backed evaluation summaries`.

### Task 4: Display summary, document provenance, and honest empty states

**Files:**
- Modify: `src/components/evaluation-action.tsx`, `src/app/courses/[id]/page.tsx`, `src/app/marks/page.tsx`, `src/app/page.tsx`, and relevant CSS in `src/app/globals.css`.
- Create: `src/components/evaluation-summary.tsx`, `src/components/evaluation-summary.test.tsx`, `src/components/insight-summary.tsx`, and `src/components/insight-summary.test.tsx`.

**Interfaces:**
- Consumes: persisted evaluation summary/evidence, cached whole-workspace summary, and submission-document status.
- Produces: UI sections titled “What you do well,” “What to improve next,” and “What to do now,” with page/slide or document references and confidence visible; a refresh action appears only when AI provider and user consent are ready.

- [ ] **Step 1: Write failing render tests** for all three summary sections on the overview and assessment view, linked source references, missing-evidence copy, AI-not-configured/consent state, and LMS attachment unavailability with upload/Drive fallback actions.
- [ ] **Step 2: Run focused tests** and confirm the new presentation is absent.
- [ ] **Step 3: Implement the whole-workspace summary panel with explicit refresh** and the assessment-level summary/document provenance presentation; label one-assessment observations separately from repeated patterns and keep illustrative examples labeled.
- [ ] **Step 4: Run** `npm test -- src/components/evaluation-summary.test.tsx src/components/insight-summary.test.tsx src/lib/dashboard-data.test.ts`, then `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] **Step 5: Commit** as `feat: show personalized evidence summary`.

### Task 5: End-to-end acceptance and status update

**Files:**
- Modify: `IMPLEMENTATION_STATUS.md`.
- Test: existing unit/integration suites plus a signed-in manual acceptance checklist.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: verified status for supported LMS retrieval or fallback, private upload, evaluation, summary, and AI configuration gate.

- [ ] **Step 1: Run** `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] **Step 2: Verify signed-in workflow** with a synthetic answer and synthetic uploaded document; do not create or retain fabricated evidence in the production student workspace.
- [ ] **Step 3: Record** observed attachment availability, configured provider/consent state, passed checks, and remaining gaps in `IMPLEMENTATION_STATUS.md`.
- [ ] **Step 4: Commit** as `docs: record submission evaluation acceptance`.
