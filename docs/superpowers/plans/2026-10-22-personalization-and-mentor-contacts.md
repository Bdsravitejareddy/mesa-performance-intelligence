# Personalization and Mentor Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user optionally add personality and narrow cognitive-reflection context to coaching, and privately track mentor/outreach relationships with source-verified suggestions.

**Architecture:** Add a private, consented assessment profile with instrument/source/version and scoring provenance; keep personality, cognitive-reflection performance, and thinking preferences separate. Add a private mentor CRM and a source-verified suggestion workflow. No message sending, employment screening, diagnostic labels, or automatic inference from marks to personality.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Auth/Postgres/RLS, existing server-side AI and private storage patterns, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-personalized-healthtech-coaching-design.md`

## Global Constraints

- Big Five is optional self-report context, not a diagnosis, objective truth, cognitive score, or job-suitability measure.
- Preserve instrument name, version, scoring provenance, completion date, and explicit opt-in; allow skip, edit, export, and deletion.
- Keep cognitive-reflection task results narrow; do not label them general intelligence.
- Do not let personality scores change official marks or demonstrated competencies.
- All assessment answers and mentor notes remain private under shared-workspace RLS.
- Suggest people only when public sources verify relevance; include source/date and do not invent private contact details.
- The dashboard never sends outreach messages.

## Review Focus

- The user skips or revokes opt-in: no questionnaire is shown as complete and no personal trait context is sent to AI.
- Existing test results use another scale/version: preserve source values and do not silently convert to IPIP scores.
- Personality inventory is incomplete: do not produce a full trait profile from partial answers.
- A contact suggestion has no verifiable public source: do not display it as sourced.
- A user deletes assessment/contact data: delete the private records and remove them from later summary prompts.

---

### Task 1: Implement optional Big Five questionnaire and external-result import

**Files:**
- Create: `supabase/migrations/20261022090002_personal_assessment_profiles.sql`.
- Create: `src/lib/personality/ipip-scoring.ts`, `src/lib/personality/ipip-scoring.test.ts`, `src/app/api/personality/route.ts`, `src/app/api/personality/route.test.ts`, `src/app/personality/page.tsx`, and focused components/tests.
- Modify: `src/components/app-shell.tsx` to add private navigation entry.

**Interfaces:**
- `scoreIpipResponses(instrumentVersion: string, responses: Record<string, 1 | 2 | 3 | 4 | 5>): BigFiveProfile | null`; reverse-score only items marked reverse in the instrument's versioned item key; require all required items for a complete profile.
- `BigFiveProfile` stores five trait scores, response completion state, instrument/version, and scoring date; no demographic inference.
- External import accepts `{ sourceName, sourceUrl?, instrumentVersion, resultValues, completedAt }` and preserves original values without mapping unknown scales to IPIP.

- [ ] **Step 1: Write failing scoring tests** for reverse-keyed items, known hand-scored vector, incomplete inventory, invalid answer range, and unknown instrument version.
- [ ] **Step 2: Run** `npm test -- src/lib/personality/ipip-scoring.test.ts`; confirm scorer does not exist.
- [ ] **Step 3: Implement the exact 50-item IPIP representation of Goldberg's 1992 Big-Five markers** at `https://www.ipip.ori.org/New_IPIP-50-item-scale.htm`, plus its official scoring key. Record the item-key version and attribution; do not call it simply “the IPIP” or copy a third-party branded test.
- [ ] **Step 4: Implement deterministic scoring and private schema** with opt-in timestamp, instrument/source/version, scores, completion state, and RLS policies. Store no raw answers after scoring unless the user explicitly chooses to keep them.
- [ ] **Step 5: Add authenticated API and UI** for consent, complete assessment, import existing result, edit, export, and delete. Distinguish imported scales from IPIP scores.
- [ ] **Step 6: Run scoring/API/schema/render tests, lint, and build**; commit as `feat: add optional personality profile`.

### Task 2: Add narrow cognitive-reflection task and thinking preferences

**Files:**
- Create: `src/lib/personality/reflection-task.ts`, tests, and sections in the personality page/component.
- Modify: migration/API from Task 1 only if a distinct `reflection` record is needed.

**Interfaces:**
- `scoreReflectionTask(responses: ReflectionResponse[]): ReflectionResult` returns correct/total, item version, completion date, and fixed limitation text stating it measures a narrow tendency to override intuitive answers, not general intelligence.
- Thinking-preference input is an optional user-authored set of labels and notes, stored separately from scored inventory results.

- [ ] **Step 1: Write failing tests** for correct answer scoring, incomplete response, repeated/unknown item IDs, and fixed narrow-scope limitation text.
- [ ] **Step 2: Run** `npm test -- src/lib/personality/reflection-task.test.ts` and verify failure.
- [ ] **Step 3: Implement a separately labeled optional reflection task** and user-authored thinking-preference form; do not combine its score with Big Five.
- [ ] **Step 4: Add separate persistence and UI controls** for edit/delete; run focused tests and commit as `feat: add optional reflection profile`.

### Task 3: Personalize summaries with opted-in context

**Files:**
- Modify: `src/app/api/evaluations/route.ts`, summary prompt/contract tests, and the summary UI created in the submission-evaluation plan.

**Interfaces:**
- `buildCoachingContext(profile: BigFiveProfile | null, preferences: ThinkingPreference[], consented: boolean): CoachingContext` returns only user-selected, high-level context or an empty object.
- Evaluation summary remains grounded in course/submission/role citations; personality context may adjust wording/action format but cannot create evidence findings or change scores.

- [ ] **Step 1: Write failing tests** proving no profile is fetched/sent without current opt-in; imported and IPIP profiles stay distinguished; personality cannot alter scores/findings/citations; deletion removes prompt context.
- [ ] **Step 2: Run focused evaluation tests** and confirm the context boundary fails.
- [ ] **Step 3: Add server-side context retrieval and prompt boundaries**; never include raw item answers or private contact notes in evaluation prompts.
- [ ] **Step 4: Run** `npm test -- src/app/api/evaluations/route.test.ts src/lib/personality` plus lint; commit as `feat: personalize coaching with opted-in context`.

### Task 4: Build private mentor contacts tracker

**Files:**
- Create: `supabase/migrations/20261022090003_mentor_contacts.sql`, `src/app/contacts/page.tsx`, `src/app/api/contacts/route.ts`, route tests, and `src/components/contacts-manager.tsx` with tests.
- Modify: `src/components/app-shell.tsx` navigation.

**Interfaces:**
- `MentorContact` fields: `id`, `name`, `role`, `organization`, `source_url`, `source_checked_at`, `shared_interest`, `outreach_goal`, `status`, `last_contact_at`, `next_action`, `next_action_at`, `private_notes`.
- Authenticated CRUD is constrained to the invited workspace; source URL must be HTTPS when present. No email/message action is implemented.

- [ ] **Step 1: Write failing RLS/API tests** for create/list/update/delete, invalid URL, anonymous requests, and inaccessible user-owned notes.
- [ ] **Step 2: Run** `npm test -- src/app/api/contacts/route.test.ts` and confirm failure.
- [ ] **Step 3: Add additive private schema and CRUD route** using session-scoped Supabase RLS and server validation.
- [ ] **Step 4: Add contacts page** with search, status, next action/date, verified source link, and private notes; test empty and populated states.
- [ ] **Step 5: Run focused tests, lint, build, and commit** as `feat: add private mentor contact tracker`.

### Task 5: Add source-verified suggestions without fabricating contacts

**Files:**
- Create: `src/lib/contacts/suggestions.ts`, `src/lib/contacts/suggestions.test.ts`, `src/app/api/contacts/suggestions/route.ts`, `src/app/api/contacts/suggestions/route.test.ts`, and suggestion controls on `src/app/contacts/page.tsx`.
- Modify: server-side source adapter only after a public source method is selected and configured; record its endpoint and retention constraints in `docs/integrations/`.

**Interfaces:**
- `discoverMentorSuggestions(criteria: MentorSearchCriteria): Promise<VerifiedContactSuggestion[]>` uses the shared Task 1 `searchPublicWeb`/`fetchPublicSource` service in the career/dashboard plan. It returns candidates only when a fetched, permitted public page directly supports the person's name, role/organization, and relevance; preserve source URL/date/evidence excerpt.
- `validateContactSuggestion(candidate: unknown): VerifiedContactSuggestion | null` rejects unknown source IDs, LinkedIn page content, search-snippet-only candidates, stale/inconsistent role evidence, and unsupported personal details.
- Queries are generic to the target role, Singapore healthtech organizations, and professional topics. A user-provided LinkedIn URL may be saved/displayed as an external link, but the app never fetches, parses, or crawls LinkedIn.

- [ ] **Step 1: Write failing tests** for a relevant fetched public bio, missing source, unverifiable relevance, private URL, stale source date, duplicate suggestion, LinkedIn domain filtering, and search-snippet-only candidate rejection.
- [ ] **Step 2: Run** `npm test -- src/lib/contacts/suggestions.test.ts` and confirm missing behavior.
- [ ] **Step 3: Implement bounded public search and source verification** using the shared service from the career plan; require user review of a cited candidate before adding it to contacts. Without a configured search key, keep manual source-link entry available and label automated suggestions unavailable.
- [ ] **Step 4: Verify** no LinkedIn crawling, no message sending, no contact details inferred from course data, and no provider secrets in browser assets; run tests/lint/build and commit as `feat: add sourced mentor suggestions`.

### Task 6: Record privacy and product acceptance

**Files:**
- Modify: `IMPLEMENTATION_STATUS.md` and the product help/privacy copy describing the optional instruments and summary context.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: verified consent, deletion, contact isolation, and sourced-suggestion acceptance notes.

- [ ] **Step 1: Test** opt-out, re-opt-in, export/delete, missing source, and shared-workspace privacy behaviors.
- [ ] **Step 2: Run** full `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] **Step 3: Update** `IMPLEMENTATION_STATUS.md` with exactly what was tested and any missing external search integration/provider configuration.
- [ ] **Step 4: Commit** as `docs: record personalization acceptance`.
