# Evidence-Based Career and Analysis Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make career readiness, SWOT, correlations, and quality checking reflect the user's evidence and target of senior Technical Product Manager roles in Singapore healthtech/healthcare.

**Architecture:** Reuse linked evaluation evidence and existing course/role tables. Preserve user-supplied role source, employer, posting date, and requirements; map requirements to work/course/resume evidence without treating phrase matches or grades as proof. Keep correlations descriptive and expose coverage, sample size, missingness, weights, and grading schemes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres/RLS, existing retrieval/evaluation services, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-personalized-healthtech-coaching-design.md`

## Global Constraints

- Preserve daily marks ingestion, SWOT, correlations, resume gap analysis, and the objective quality checker.
- Keep all official marks on their original 0–100 scale and retain source provenance.
- Do not average academic, analytical, and professional results.
- Cite source document/version/page/slide and role source/date; never treat correlation as causality.
- Do not claim hiring probability, clinical suitability, or seniority fit from marks or keyword matches.
- Handle incomplete evidence honestly; a single low mark is not proof of missing competency.
- Keep private workspace RLS and no secrets/student content in logs or fixtures.

## Review Focus

- A role has no date, employer, or source URL: show as incomplete/unverified and do not use it as a benchmark.
- A role requirement appears as a resume phrase without work evidence: label the phrase only; do not call it demonstrated.
- A topic has one weak score or missing submissions: show insufficient evidence rather than a definitive weakness.
- Different grading schemes or assessment weights are mixed: separate or qualify summaries rather than directly compare raw averages.
- No saved evaluations exist: show a useful empty state explaining which evidence is needed; never use synthetic demo data as real output.
- A search result points to LinkedIn or another disallowed page: do not fetch it or use its snippet as evidence; retain only a manually supplied link for user-opened viewing.
- A public page redirects to a private IP, blocked path, unsupported content type, or robots-excluded path: reject it safely without retrying around the restriction.

---

### Task 1: Build shared public web search and safe page retrieval

**Files:**
- Create: `src/lib/public-research/contracts.ts`, `src/lib/public-research/search-provider.ts`, `src/lib/public-research/search-provider.test.ts`, `src/lib/public-research/safe-fetch.ts`, `src/lib/public-research/safe-fetch.test.ts`, and `docs/integrations/public-research.md`.
- Modify: `.env.example` and deployment configuration documentation; never add actual keys.

**Interfaces:**
- `searchPublicWeb(query: SearchQuery, provider: SearchProvider): Promise<SearchHit[]>` returns title/URL/snippet/provider/date for discovery only.
- `fetchPublicSource(url: string, policy: CrawlPolicy): Promise<PublicSource>` returns page title/text/date/canonical URL/content hash/retrieval time, or a typed blocked/unavailable result.
- Search providers are Tavily or Brave, selected server-side by `PUBLIC_SEARCH_PROVIDER`; credentials use `TAVILY_API_KEY` or `BRAVE_API_KEY`. Send only public research queries (role title/location, organization, professional topic); never send a resume, marks, submissions, course files, or private contact notes.
- Budgets per user-initiated discovery: at most 8 distinct search queries, 5 results per query, and 12 fetched pages; max 2 MiB per page, 8 seconds per request, 30 seconds overall, three concurrent fetches, and at least one second between requests to the same host.
- Search-result snippets are discovery hints only. Fetch a directly supporting permitted public page before treating a person or role claim as evidence.

- [ ] **Step 1: Write failing tests** for provider response mapping, missing-key readiness, secret redaction, deduplicated query/result/fetch budgets, URL validation, private/loopback IP rejection, DNS rebinding/redirect revalidation, response/time/size/concurrency limits, per-host throttling, disallowed content types, robots exclusion, and LinkedIn-domain rejection.
- [ ] **Step 2: Run** `npm test -- src/lib/public-research/search-provider.test.ts src/lib/public-research/safe-fetch.test.ts` and confirm the modules are missing.
- [ ] **Step 3: Implement Tavily/Brave server adapters** with bounded query/result counts, timeouts, and no answer-content reliance. Keep credentials in server-only environment variables.
- [ ] **Step 4: Implement safe public fetching** with HTTPS-only requests, DNS/IP checks on every redirect, standard ports, the exact budgets in this plan, text/HTML-only parsing, a truthful user agent, robots.txt checks, and a denylist for LinkedIn and other disallowed domains. Only fetch approved source classes/domains described in `docs/integrations/public-research.md`; robots.txt compliance is necessary but does not override site terms.
- [ ] **Step 5: Test** that LinkedIn results are filtered before fetching and snippets alone cannot create verified sources; run focused tests and lint; commit as `feat: add bounded public research providers`.

### Task 2: Store traceable role benchmark sources

**Files:**
- Modify: `supabase/migrations/20261022090001_role_benchmark_sources.sql`, `src/app/api/roles/route.ts`, `src/components/role-profile-form.tsx`, `src/app/career/page.tsx`.
- Create: `src/app/api/roles/route.test.ts` if absent; add role-form tests.

**Interfaces:**
- Produces `RoleBenchmark`: `{ title: string; employer: string; industry: string; sourceUrl: string; retrievedAt: string; postingDate: string | null; competencies: RoleCompetency[] }`.
- `RoleCompetency` contains `{ title: string; description: string; sourceQuote: string; evidenceKind: "responsibility" | "required" | "preferred" }`.
- Consumes: existing `role_profiles`; stores `employer`, `source_url`, `retrieved_at`, `posting_date`, and structured requirements in `competencies` with user ownership.

- [ ] **Step 1: Write failing tests** for valid HTTPS source and requirements, missing source/date handling, rejection of non-HTTPS URLs, cross-workspace writes, and preserving exact requirement source quotes.
- [ ] **Step 2: Run** `npm test -- src/app/api/roles/route.test.ts` and observe failures.
- [ ] **Step 3: Add the additive role-source migration and route validation**; support a bounded search using Task 1, fetch permitted public employer career pages, and also accept a user-supplied URL/description. Search snippets alone cannot create criteria; never crawl LinkedIn. Keep search credentials server-side and require a configured provider key for automated discovery.
- [ ] **Step 4: Update role form/page** with the default target title “Senior Technical Product Manager — HealthTech/Healthcare — Singapore,” a “Find public roles” action, employer/source URL, posting/retrieval date, and explicit requirements. The user reviews the fetched source and confirms it before saving a benchmark.
- [ ] **Step 5: Run focused tests** and migration/schema tests; commit as `feat: save sourced role benchmarks`.

### Task 3: Map role requirements to demonstrated evidence

**Files:**
- Create: `src/lib/career/evidence-map.ts`, `src/lib/career/evidence-map.test.ts`.
- Create: `src/app/api/career/evidence/route.ts` and `src/app/api/career/evidence/route.test.ts`.
- Modify: `src/app/api/roles/route.ts`, `src/app/career/page.tsx`, `src/components/career-gap-checker.tsx`, `src/lib/ai/contracts.ts` only if the AI response contract needs role-source citations.

**Interfaces:**
- `mapRoleEvidence(requirements: RoleCompetency[], evidence: CareerEvidence[]): RoleEvidenceFinding[]` prepares requirement/evidence candidates and state (`demonstrated | adjacent | unverified | development_needed`), evidence IDs/quotes/source labels, confidence, and next action. Each result also has `reviewStatus: "suggested" | "accepted" | "dismissed"`; AI output always begins `suggested`.
- A grounded AI classification may suggest relevance for retrieved candidates but must cite only supplied role/evidence keys; user confirmation is required before saving a competency as demonstrated.
- `CareerEvidence` is built from resume statements, evaluation findings, topic competencies, and linked submissions; it retains provenance and evidence kind.

- [ ] **Step 1: Write failing mapping tests** for a course-evidence match, adjacent evidence, phrase-only resume match, unsupported requirement, conflicting evidence, and no evidence.
- [ ] **Step 2: Run** `npm test -- src/lib/career/evidence-map.test.ts` and confirm missing behavior.
- [ ] **Step 3: Implement deterministic candidate retrieval and a grounded AI suggestion route**; phrase match alone can only return `unverified`, never `demonstrated`. Require the same server provider gate and per-user disclosure consent as submission evaluations.
- [ ] **Step 4: Update career UI** to show source requirement, evidence state, citations, confidence, and professional improvement action; let the user accept/edit/dismiss AI relevance suggestions; retain phrase coverage as a subordinate signal.
- [ ] **Step 5: Test** unknown citation rejection, missing evidence, role-source change invalidation, no-consent/no-provider behavior, and phrase-only evidence; run focused tests and lint; commit as `feat: map role requirements to evidence`.

### Task 4: Evidence-backed SWOT and quality-check connections

**Files:**
- Modify: `src/app/swot/page.tsx`, `src/app/api/swot/route.ts`, `src/components/swot-form.tsx`, `src/app/quality-check/page.tsx`, `src/components/quality-checker.tsx`, `src/lib/quality.ts`.
- Create: `supabase/migrations/20261022090005_insight_review_state.sql`, `src/lib/insights/swot-candidates.ts` and tests, `src/app/api/quality-check/route.ts` and tests; add SWOT render/API tests.

**Interfaces:**
- `generateSwotCandidates(evidence: EvaluationEvidence[], roles: RoleEvidenceFinding[]): Promise<SwotCandidate[]>` returns category/title/evidence/source/confidence and default `review_status: "suggested"`; candidates are AI-generated only from supplied evidence keys and require user review.
- `inspectAgainstAssessment(text: string, instructions: string[], rubric: ApprovedCriterion[]): QualityReport` produces deterministic checks with explicit assessment constraints and no score by itself. A separately labeled AI critique may add cited notes when consent/configuration and relevant assessment references are available.

- [ ] **Step 1: Write failing tests** for cited candidate generation, low-confidence review state, dismissal/edit preservation, quality checks against supplied constraints, current-user AI consent, and deterministic-only fallback when assessment context or consent is absent.
- [ ] **Step 2: Run focused tests** and confirm current manual-only SWOT and generic quality checks do not satisfy them.
- [ ] **Step 3: Implement evidence-bounded SWOT candidate generation and review state plus assessment-aware deterministic quality checks**; do not auto-persist AI inferences as facts.
- [ ] **Step 4: Add an authenticated quality-check route** that combines deterministic checks with separately labeled AI critique grounded in only the selected assessment instructions/rubric and relevant course references. Require current AI consent; if absent, return deterministic results only.
- [ ] **Step 5: Add UI controls** to accept, edit, dismiss, or add SWOT observations and select an assessment/rubric in the quality checker; display deterministic and AI findings separately. Persist review status without overwriting the original evidence.
- [ ] **Step 6: Run focused tests, lint, and commit** as `feat: ground SWOT and quality checks in evidence`.

### Task 5: Expand descriptive correlations and mastery coverage

**Files:**
- Create: `src/lib/insights/correlations.ts`, `src/lib/insights/correlations.test.ts`.
- Create: `src/app/api/insights/feedback-themes/route.ts` and route tests.
- Modify: `src/app/correlations/page.tsx`, relevant course/dashboard data loaders, and `src/app/globals.css`.
- Reuse: `topic_competencies`, assessment weights, evaluation evidence, official submissions/marks, and course material references.

**Interfaces:**
- `buildPerformancePatterns(input: CorrelationInput): CorrelationViewModel` returns grouped descriptive values plus `n`, total/observed weights, missing-submission count, grading scheme, evidence coverage, and caveat strings.
- `summarizeFeedbackThemes(feedback: OfficialFeedbackEvidence[]): Promise<FeedbackTheme[]>` returns AI-suggested themes with exact source-feedback IDs/quotes, confidence, and insufficient-evidence state; it never claims a theme caused a score change.
- Topic state uses the existing exact states: `not_yet_taught`, `taught_not_assessed`, `insufficient_evidence`, `demonstrated`, `development_needed`.

- [ ] **Step 1: Write failing tests** for learning-objective groups, format groups, conceptual/quantitative categories, repeated-topic errors, improvement across repeated assessments, academic versus professional evidence, feedback-theme citation/confidence validation, missing marks, different grading schemes, assessment weights, small samples, and no-causality caveats.
- [ ] **Step 2: Run** `npm test -- src/lib/insights/correlations.test.ts` and verify missing logic.
- [ ] **Step 3: Implement deterministic summaries**; keep incompatible grade schemes separate and surface coverage, sample size, and weights with every view. Keep AI feedback-theme synthesis in a separate function/route, require current AI consent, and validate every cited feedback ID against supplied records.
- [ ] **Step 4: Render topic mastery and descriptive patterns**; use evidence-linked AI evaluation outputs as category inputs, but compute all grouped statistics deterministically. Do not render causal labels or claim learning effectiveness from correlations.
- [ ] **Step 5: Run focused tests, lint, production build, and commit** as `feat: expand evidence-based performance patterns`.

### Task 6: Verify feature pages against empty and populated workspaces

**Files:**
- Modify: `IMPLEMENTATION_STATUS.md`.
- Create: `src/app/career/page.test.tsx`, `src/app/swot/page.test.tsx`, `src/app/correlations/page.test.tsx`, `src/app/quality-check/page.test.tsx`.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: honest empty/populated UI behavior and acceptance notes for SWOT, correlations, career readiness, and quality checker.

- [ ] **Step 1: Add rendering tests** for zero evidence, synthetic preview labeling, populated citations, and role-source dates.
- [ ] **Step 2: Run** `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] **Step 3: Record** actual coverage and limits, including the five real marks and absent evaluation reports at test time, in `IMPLEMENTATION_STATUS.md`.
- [ ] **Step 4: Commit** as `docs: record analysis dashboard acceptance`.
