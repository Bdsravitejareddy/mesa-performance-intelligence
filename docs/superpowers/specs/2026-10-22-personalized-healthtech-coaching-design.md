# Evidence-Grounded HealthTech Career Coaching Design

**Date:** 2026-10-22  
**Status:** Design approved in conversation; awaiting written-spec review before implementation planning.  
**Product:** Mesa Performance Intelligence, reconstructed in this repository. The original A–H brief remains unavailable; preserve every recovered requirement and do not invent missing A–H behavior.

## Goal and user intent

The dashboard should explain not only what the student scored, but what course work and submitted work demonstrate, how that evidence maps to senior Technical Product Manager roles in Singapore healthtech/healthcare, and what to do next. It should combine deterministic checks with AI inference grounded in course, submission, feedback, and professional-role evidence. The user specifically wants an AI summary of what they do well, where they can improve, and what actions to take.

The app remains a private, shared Mesa workspace, using the existing Next.js/TypeScript, Vercel, and Supabase architecture. Official LMS marks remain on the confirmed 0–100 scale, preserving original score/maxima and provenance. The existing daily marks ingestion, course intelligence, SWOT, correlations, resume gap analysis, and objective quality checker remain in scope. The source repository is a reconstruction; missing original A–H requirements remain an explicit gap.

## Approaches considered

1. Separate manual analyses would be quick to prototype, but duplicate evidence and can contradict each other.
2. An AI-first coach could produce broad narratives, but would make it difficult to verify findings against course material, submissions, and actual role requirements.
3. **Recommended and selected: one evidence-linked model with deterministic verification and grounded AI.** This shares traceable evidence across the analysis views while keeping each evaluation distinct and reviewable.

## Evidence model and submission access

Connect assessments to the student's submission files, official marks and feedback, rubric criteria, course materials, learning objectives, extracted answer evidence, and—when selected—professional role requirements. Preserve document name/version and page/slide or other source location for every citation.

The submission ingestion path first checks the authorized Mesa Nexus MCP tools for attachment references and a supported way to retrieve each file. Current sync imports assignment and grade metadata but writes empty submission answer text; access to attachment contents is unverified. Do not scrape around LMS controls or bypass access restrictions. If a supported attachment retrieval path is unavailable, present that fact and allow the user to link an existing connected Drive item or upload a submission. Never silently treat assignment metadata as the student's work.

Use the existing course-material parsing and retrieval stack. Retrieve only relevant course excerpts for each evaluation. Keep extracted material, answer text, and evaluations private under existing workspace RLS and storage policies. Do not log student text. Keep source location and version visible in findings.

## Evaluation and personalized summary

Each assessment can produce three independent results:

- **Mesa Academic Evaluation:** alignment with the official rubric, assignment instructions, taught material, and learning outcomes.
- **Objective Analytical Evaluation:** validity of calculations, logic, assumptions, data interpretation, and evidence.
- **Professional Readiness Evaluation:** demonstrated evidence against the selected role profile and relevant healthtech context.

Do not average these scores. Preserve official rubric criteria, weights, and maxima. Clearly label inferred criteria and require review/approval before use. Compare official marks and feedback to evidence criterion by criterion; a score difference alone never proves that an official mark is wrong. Use deterministic code for numerical verification wherever possible and identify alternative defensible assumptions, incomplete evidence, and verification limits.

Provide a concise AI-generated summary with three sections: **What you do well**, **What to improve next**, and **What to do now**. Prioritize a small number of actionable changes, connect repeated patterns across marks, feedback, work samples, course evidence, and professional-role requirements, and cite the supporting records. Distinguish a single-assessment observation from a repeated pattern. State when evidence is weak, missing, or conflicting; never invent strengths, deficits, or causes. Reconstructed examples are labeled illustrative.

Grounded AI is a core product behavior. Keep provider calls server-side and retrieve only relevant excerpts. Before enabling external inference, disclose the configured provider and relevant excerpt handling/retention behavior in the app and obtain the required user approval; keep AI disabled while the existing configuration gate is unmet. Cache evaluations by content and rubric/role version, and invalidate when evidence changes.

## Career readiness for Singapore healthtech

The default goal profile is **Senior Technical Product Manager — HealthTech/Healthcare — Singapore**. Build a role profile from current, verifiable job descriptions supplied by the user or retrieved from public employer career pages. Preserve source URL, employer, title, retrieval date, and exact requirements. Government and healthcare sources such as Singapore HSA digital-health guidance can supply domain context, but do not substitute for employer requirements or prove a competency. Do not infer a single universal standard from one posting.

Map each requirement to course evidence, submitted work, resume evidence, or an explicit evidence gap. Separate demonstrated skill, adjacent evidence, and unverified claims. Keep resume gap analysis; explain how each improvement applies to the target role. Do not claim hiring probability or seniority fit from grades alone.

## Personality, cognitive reflection, and thinking preferences

Offer both an optional in-dashboard Big Five assessment and entry of an existing assessment result. The proposed open inventory is IPIP-based; provide source/version and scoring provenance. Results are self-report context, not clinical findings, objective truth, or evidence of job suitability. The user may skip, edit, export, or remove these results. Do not change marks or demonstrated competencies based on personality scores; use results only to tailor coaching language and suggested work habits, with explicit opt-in.

Keep personality separate from cognitive performance. A cognitive-reflection task may describe performance on a narrow reasoning task, not general intelligence. Do not claim it measures overall cognitive ability. Thinking-style insights should be framed as preferences or observed behaviors, not fixed traits. Any self-reported thinking preference is distinct from a scored cognitive task. Explain limitations and avoid using these data in an employment decision.

## SWOT, correlation, mastery, and quality checking

Populate SWOT observations from cited evidence and let the user review, edit, dismiss, or add an observation. Do not automatically turn uncertain AI inference into a fact. Extend correlations to course topics/objectives, assessment formats, conceptual versus quantitative performance, repeated errors, feedback themes, improvement over repeated assessment, and academic versus professional evidence. Show sample size, assessment weights, missing submissions, grading schemes, and evidence coverage; correlation alone does not establish learning effectiveness or causality.

Show topic states as not yet taught, taught but not assessed, assessed with insufficient evidence, demonstrated competency, and development needed. Weight evidence across assessments rather than equating one poor result with lack of mastery. The quality checker remains an objective tool: apply deterministic structure, consistency, and calculation checks where possible; use assessment instructions/rubrics as explicit constraints; label any AI critique and cite its evidence.

## Mentor contacts

Add a private contact and mentoring tracker with name, current role/company, public source or relationship context, shared interest, outreach goal, status, last contact, next action/date, and private notes. Provide sourced suggestions only when a public profile or organization source verifies the person's relevance to Singapore healthtech/product work. Show the source and date; never fabricate people or private contact details. No messages are sent by the dashboard.

## MVP flow and scope order

1. Link or retrieve the submitted assessment document through supported LMS access; permit Drive selection/upload fallback when necessary.
2. Extract answer text/tables while preserving source locations and versions.
3. Link the assessment to course materials and official or reviewable inferred rubric.
4. Run deterministic calculation checks and grounded AI evaluation with three separate layers.
5. Show the cited strengths/improvements/actions summary and allow the user to review findings.
6. Feed reviewed evidence into SWOT, topic mastery, correlations, career gaps, and quality checking.
7. Add optional personality/result import and thinking-preference context, then the private mentor tracker and sourced suggestions.

This priority preserves the existing Module I P0 workflow and closes the current core gap: marks and course files exist, but submission answer content and evidence-linked evaluations are absent. Do not remove or replace daily marks ingestion, SWOT, correlations, resume gap analysis, or quality checking.

## Data and implementation constraints

Use current architecture and minimal additive schema. Reuse `submissions`, `evaluation_reports`, `evaluation_evidence`, `material_references`, `role_profiles`, `resume_gap_findings`, `topic_competencies`, `swot_entries`, and `quality_checks` where they fit. Add only the minimal records needed for personality assessments and mentor contacts, including consent/source/version fields. Link imported submission files to their assessment and preserve LMS source IDs. No paid vector service is needed; retain lightweight local retrieval. Apply RLS and private storage rules to all personal records.

The current production workspace has 19 courses, 44 assessments, five marks, and two feedback records, but no evaluation reports, SWOT entries, role profiles, resume gap findings, saved quality checks, or topic competencies. Thus most current pages show empty-state copy or synthetic demo examples. The LMS tool inventory seen so far does not establish document-download capability; this must be tested before promising automatic submission retrieval.

## Acceptance criteria

- The signed-in user can retrieve an LMS-linked submission file using only a supported, authorized read path, or is shown a clear limitation and can link a connected Drive document/upload a file.
- Extracted submission content is connected to its assessment, relevant course sections, official feedback/mark, and official or reviewable inferred rubric.
- Written evaluation returns three separate scores/findings and evidence references; deterministic arithmetic checks distinguish correct method/result, arithmetic error, incorrect method, unsupported reasoning, and unverifiable evidence where applicable.
- The personalized summary contains evidence-backed strengths, prioritized improvements, and concrete next actions; it labels sample size/confidence and missing or contradictory records.
- Role readiness uses a dated, traceable Singapore healthtech role source and maps requirements to work/course/resume evidence without treating keyword match or grades as proof.
- Optional IPIP Big Five and external-result paths can be skipped and removed. Personality, narrow cognitive-reflection performance, and thinking preferences remain distinct and do not alter official marks.
- SWOT, topic mastery, correlation, career gaps, and quality-check findings are evidence-linked and visibly distinguish observed facts from AI inferences.
- Contacts can be privately tracked; suggested people have a verifiable public source and date, and the system never invents contact details or sends outreach.
- All existing Module I acceptance cases remain: PDF/PPTX course upload/indexing, course/assessment linkage, grounded rubric, course-grounded written-answer evaluation, numerical verification, separate evaluation layers, major-finding citations, official mark comparison, honest incomplete-material handling, and topic-level strengths/weaknesses.
- The product retains recovered legacy feature entry points and discloses that unknown original A–H requirements remain unrecovered.

## Evidence sources for initial role context

- Singapore HSA, [Digital Health](https://www.hsa.gov.sg/medical-devices/digital-health/), for current local digital-health and regulatory context.
- Singapore MOH, [Our Partners](https://www.moh.gov.sg/about-us/our-partners/), for public healthcare/HealthTech ecosystem organizations.
- AEA, Frederick (2005), [Cognitive Reflection and Decision Making](https://doi.org/10.1257/089533005775196732), for the narrow stated construct and limitations of the Cognitive Reflection Test.
- [IPIP official site](https://ipip.ori.org/) and the [NIH IPIP-NEO overview](https://www.nih.gov/node/21486) for the proposed public-domain Big Five inventory source and instrument provenance.

