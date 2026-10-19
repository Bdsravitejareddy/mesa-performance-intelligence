# Mesa Performance Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a course-grounded academic and professional performance intelligence MVP while preserving every recovered legacy feature requirement and recording all unrecovered A–H details.

**Architecture:** The original repository was not found. The user approved a GitHub-backed Next.js/TypeScript dashboard for manual Vercel deployment, with Supabase Postgres/Auth/private Storage and a configurable server-side model adapter. LMS sync stays disabled until a permitted source contract is verified.

**Tech Stack:** Next.js App Router + TypeScript, Supabase Postgres full-text search/Auth/private Storage, and a server-side model adapter. The user will deploy manually to Vercel. No remote project is confirmed or modified.

**Architecture decision:** User confirmed the Vercel/GitHub approach and requested Supabase for storage. See `docs/superpowers/specs/2026-10-19-vercel-mvp-architecture.md`. Build and verify locally, then push code to a new private GitHub repository if CLI authorization permits. User will perform Vercel deployment. Hosted model provider and sign-in allowlist remain configuration gaps. LMS daily sync remains disabled pending a verified permitted data contract.

**Spec:** `PRODUCT_BRIEF.md`

## Global Constraints

- Course-grounded evaluation is P0.
- Preserve daily marks ingestion, SWOT, correlations, resume gap analysis, and the objective quality checker.
- Official rubric criteria, weights, and maximum marks remain authoritative when provided.
- AI-inferred rubrics must never be presented as official faculty rubrics.
- Keep Mesa academic, objective analytical, and professional readiness evaluations separate; do not average automatically.
- Use deterministic code to verify calculations wherever possible.
- Cite source document, version, and page/slide for major evaluation findings.
- Correlation alone must not be described as causality or learning effectiveness.
- Official course marks are on a 0–100 scale; retain source scores and do not normalize them again. Preserve rubric-specific internal weights/maxima separately.
- Use local document parsing and lightweight indexed retrieval for MVP; do not add paid vector storage without demonstrated need.
- Never store plaintext credentials, cookies, or session tokens in the repository.
- Do not claim full A–H coverage until the original requirements are recovered.

## Review Focus

- Missing or outdated LMS content: sync must preserve prior source data and show a recoverable error rather than silently deleting it.
- Missing rubrics or incomplete materials: evaluation must state the limitation and use only transparent inferred criteria.
- Multiple defensible assumptions: show alternatives and mark verification limits.
- Small samples, missing submissions, or different grading schemes: show coverage and uncertainty; do not infer causality.
- Unsupported or stale material references: surface the source gap rather than produce untraceable findings.

---

### Task 1: Recover product source and implementation root

**Files:**
- Inspect: current workspace and candidate Git repositories.
- Update: `PRODUCT_BRIEF.md`, `IMPLEMENTATION_STATUS.md`.

**Interfaces:**
- Consumes: current conversation and user-provided source repository/brief when available.
- Produces: verified repository root, Git URL if any, recovered module inventory, and a gap register.

- [ ] Search candidate source repositories and supplied documents for the original A–H specification and established stack.
- [ ] Record every recovered requirement verbatim or by faithful summary; keep unknown details in the gap register.
- [ ] Confirm the application root and runtime before adding product code.

### Task 2: Map permitted LMS integration

**Files:**
- Create: integration contract documentation under `docs/integrations/` after discovery.
- Update: `IMPLEMENTATION_STATUS.md`.

**Interfaces:**
- Consumes: authenticated LMS UI and any official or explicitly permitted LMS integration.
- Produces: versioned data contract for course, assessment, score, feedback, rubric, and course material records; auth and rate-limit requirements.

- [ ] Inspect Courses, My Work, Attendance & Grade, Documents, and course detail pages for available assessment and material fields.
- [ ] Identify an official or permitted authenticated data interface and verify its read behavior, pagination, update markers, and error responses.
- [ ] Record no credentials, cookies, or tokens in repository files or logs.
- [ ] If no permitted stable interface is available, document the limitation and use an explicitly approved export workflow rather than scraping around access controls.

### Task 3: Design and implement the daily LMS sync

**Files:**
- Create/modify: source-specific sync module and secure runtime configuration in the recovered application repository.
- Update: `IMPLEMENTATION_STATUS.md`.

**Interfaces:**
- Consumes: the verified LMS integration contract from Task 2.
- Produces: idempotent daily synchronization for marks, feedback, rubrics, and course materials with source timestamps and per-record provenance.

- [ ] Choose persistent authentication supported by the LMS and store secrets only in an OS credential store or deployment secret manager.
- [ ] Implement pagination, retry/backoff, idempotency, partial-failure reporting, and a visible last-success timestamp.
- [ ] Preserve existing records on failed/incomplete sync and record deletions only when the source confirms them.
- [ ] Provide an operator-triggered sync path for recovery.

### Task 4: Ingest and index course materials

**Files:**
- Create/modify: document parsers, material/reference data model, local retrieval index, and upload UI in the recovered stack.
- Update: `PRODUCT_BRIEF.md`, `IMPLEMENTATION_STATUS.md` only when behavior changes.

**Interfaces:**
- Consumes: uploaded PDF/PPT/PPTX and verified LMS material metadata.
- Produces: extracted text/table/visual references indexed by course, module, session, topic, objective, assessment, source version, and page/slide.

- [ ] Parse PDF and PPTX content locally, preserving names, versions, page/slide numbers, and table data.
- [ ] Add SQLite FTS or the stack's equivalent local retrieval index.
- [ ] Make relevant diagram/chart/image interpretation explicit and retain links to original pages/slides.
- [ ] Retrieve only relevant excerpts for evaluation; cache parsed data and optional embeddings/results.

### Task 5: Generate and manage course-grounded rubrics

**Files:**
- Create/modify: rubric and rubric-criterion models, generation workflow, review UI.

**Interfaces:**
- Consumes: assessment instructions, course objectives, relevant materials, faculty examples, and official rubric when supplied.
- Produces: official or inferred rubric records with provenance, weights, maximum marks, and approval state.

- [ ] Apply the evidence hierarchy in `PRODUCT_BRIEF.md`.
- [ ] Preserve official criteria, weights, and maximum marks without rewriting them.
- [ ] Mark inferred criteria as AI-inferred and require user review/edit/approval.
- [ ] Handle absent rubrics and incomplete course material honestly.

### Task 6: Evaluate submissions with three independent evidence layers

**Files:**
- Create/modify: evaluation service, evidence records, calculation verification, feedback presentation.

**Interfaces:**
- Consumes: submission, assessment, approved rubric, relevant course excerpts, official answer key if available, and optional professional-role profile.
- Produces: separate Mesa Academic, Objective Analytical, and Professional Readiness evaluations with evidence references and verification status.

- [ ] Evaluate all qualitative dimensions and report missing concepts, framework misuse, assumptions, unsupported claims, and valid alternatives.
- [ ] Verify quantitative formulas and calculations deterministically where possible; compare answer keys when available.
- [ ] Explain method/answer distinctions and alternative defensible assumptions.
- [ ] Reconcile official marks and feedback without declaring official marks wrong from score differences alone.
- [ ] Label reconstructed improvement examples as illustrative.

### Task 7: Build mastery, correlation, SWOT, gap, and quality dashboards

**Files:**
- Create/modify: course competency dashboard, correlation views, SWOT, resume gap analysis, and objective quality checker in the recovered application.

**Interfaces:**
- Consumes: verified sync records and evidence-linked evaluations.
- Produces: topic/objective mastery states, trend and coverage views, professional role gaps, SWOT, and objective quality findings.

- [ ] Show taught/assessed/evidence/competency states with evidence-weighted confidence and improvement over time.
- [ ] Expose sample size, assessment weight, missing evidence, and grading-scale caveats in correlations.
- [ ] Integrate the three evaluations without averaging them.
- [ ] Preserve the known legacy features; add no behavior for unrecovered A–H requirements without source confirmation.

### Task 8: Manual MVP acceptance review

**Files:**
- Update: `IMPLEMENTATION_STATUS.md` with observed acceptance results and remaining gaps.

**Interfaces:**
- Consumes: working end-to-end MVP.
- Produces: reviewable status against the acceptance criteria in `PRODUCT_BRIEF.md`.

- [ ] Demonstrate upload of a PDF or PPTX, extraction, indexing, course/assessment association, rubric generation, written-answer evaluation, and evidence-linked feedback.
- [ ] Demonstrate deterministic numeric verification, three separate evaluations, official mark comparison, honest missing-material handling, and topic-level strengths/weaknesses.
- [ ] Demonstrate the once-daily sync and known-feature entry points for marks, SWOT, correlations, resume gap analysis, and the quality checker.
- [ ] Record failures and unimplemented recovered A–H requirements; do not claim complete acceptance while gaps remain.
