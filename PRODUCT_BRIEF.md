# Mesa Performance Intelligence Platform — Product Brief

> **Reconstructed brief.** The original product brief, repository, and implementation architecture were not present in the current workspace or conversation. This document preserves requirements that can be recovered from the conversation and marks missing A–H details explicitly. It does not claim to reproduce the absent original brief.

## Product objective

Build an academic and professional performance intelligence system that understands what students scored, what they were taught, what they demonstrated, why they performed as they did, and what they need to improve.

The platform must retain the original scope where it can be recovered: daily marks ingestion, SWOT, correlations, resume gap analysis, and an objective quality checker. The detailed original definitions for modules A–H, the original acceptance criteria, analytical integrity rules, and the existing stack remain to be recovered. Do not invent their behavior; record and resolve those gaps before claiming full preservation.

### Confirmed grading scale

Official course marks and grading use a 100-point scale. Store and display official marks as scores out of 100; validate values against the recorded maximum and do not apply an additional normalization. Preserve the rubric's own criterion weights and maximum marks when it uses a different internal total, and show that rubric result separately from the official course mark out of 100. Reconcile marks against feedback criterion by criterion, retaining the original reported score and provenance.

## Known legacy scope (modules A–H)

The conversation identifies these existing capabilities as requirements that must remain intact:

- Daily marks ingestion.
- SWOT analysis.
- Correlation analysis.
- Resume gap analysis.
- An objective quality checker.

The conversation does not contain the original module boundaries, input/output definitions, UX, scoring rules, acceptance criteria, or architecture for A–H. Those are open requirements, not permission to omit or redesign them. Until the original source is recovered, preserve the five named capabilities as a minimum known inventory and label all other A–H details as unavailable.

## Module I — Course Content Intelligence

Course materials are a core knowledge source for the platform. The first useful workflow is:

**Course upload → content extraction → assessment linkage → rubric generation → submission evaluation → evidence-linked feedback → dashboard.**

### Course material ingestion and organization

Support uploading and organizing syllabi and learning objectives; PPT/PPTX lecture slides; PDFs and lecture notes; case studies and business frameworks; assignment instructions; assessment rubrics and marking schemes; reference readings; sample questions and model answers; faculty examples; and assessment papers and answer keys.

Organize materials by course, module, session, topic, learning objective, and assessment. Extract text and relevant table data. Preserve document name, slide/page number, source reference, and document version. For important diagrams, charts, and images in slides, provide a visual interpretation mechanism instead of relying only on extracted text.

### Course-grounded rubric generation

Use evidence in this order:

1. Official assessment rubric or marking scheme.
2. Assignment instructions and explicit requirements.
3. Course learning outcomes and syllabus.
4. Relevant lecture content and faculty examples.
5. Course-supplied reference materials.
6. Transparent general academic evaluation criteria.

Never label an AI-inferred rubric as an official faculty rubric. Preserve official criteria, weights, and maximum marks when available. Let users review, edit, and approve inferred rubrics.

### Qualitative analysis

Evaluate conceptual understanding; correct application of taught frameworks; reasoning depth; critical thinking; evidence quality; structure and clarity; relevance to the question; business applicability; originality where appropriate; and alignment with learning objectives.

Identify missing concepts, incorrect framework applications, weak assumptions, and unsupported conclusions. Cite the specific course material supporting each finding. Do not penalize a valid alternative approach unless the assessment explicitly requires a particular framework.

### Quantitative analysis

Evaluate formula selection, mathematical accuracy, calculation steps, units and denominators, assumptions, data interpretation, statistical reasoning, financial and marketing metrics, sensitivity analysis, and numerical consistency.

Use deterministic code to verify calculations wherever possible. Compare calculations with official answer keys when available. Where unspecified assumptions permit multiple defensible answers, identify the alternatives. Distinguish correct method and answer; correct method with arithmetic error; incorrect method; correct result with unsupported reasoning; and insufficient information to verify.

### Three independent evaluation layers

For each assessment, show these results separately and do not average them automatically:

- **Mesa Academic Evaluation:** satisfaction of course content, learning outcomes, assignment requirements, and official rubric.
- **Objective Analytical Evaluation:** validity of calculations, logic, assumptions, evidence, and conclusions.
- **Professional Readiness Evaluation:** comparison with the expectations of a selected professional role or industry standard.

Explain differences with specific evidence. Scores such as 88/100, 79/100, and 64/100 are illustrative examples only, not actual results or fixed thresholds.

### Feedback and marks reconciliation

Compare official marks, official evaluator feedback, the student submission, course requirements, and AI rubric-based evaluation. Identify agreement between marks and demonstrated performance; potentially overlooked strengths; weaknesses consistent with evaluator feedback; apparent grading discrepancies; and areas where evidence is insufficient.

Never claim an official mark is wrong solely because the AI score differs. State the precise criterion, source evidence, and reason for disagreement.

### Course mastery dashboard

Show topics taught, topics assessed, performance by topic, conceptual weaknesses, quantitative error patterns, repeated feedback themes, learning-objective coverage, and improvement over time.

Represent each competency as one of: not yet taught; taught but not assessed; assessed with insufficient evidence; demonstrated competency; or development needed. Weight evidence by quality and coverage; do not treat one poor assessment as proof of lack of mastery.

### Course-grounded improvement examples

For each meaningful weakness, explain what the student did, what the course expected, why the answer was incomplete or incorrect, the relevant course reference, an improved example, how the example meets the rubric, and how the skill applies professionally. Label reconstructed examples as illustrative, never as actual student submissions.

### Correlation with course coverage

Extend correlation analysis to performance by learning objective and assessment format; conceptual versus quantitative competency; repeated errors across related topics; feedback themes across courses; improvement after repeated assessment of a concept; and academic performance versus professional competency evidence.

Account for sample size, assessment weights, missing submissions, and different grading schemes. Correlation alone must not be described as learning effectiveness or causality.

### Minimum technical architecture for Module I

Use the existing application stack once it is recovered. The original stack is not available in this workspace, so no framework or deployment platform is selected here. Keep the data model minimal and include entities for Course, CourseModule, CourseMaterial, LearningObjective, Rubric, RubricCriterion, MaterialReference, TopicCompetency, and EvaluationEvidence. Link assessments, feedback, submissions, and scores to relevant materials.

Implement local document parsing and indexed retrieval. For the MVP, use SQLite full-text search or another lightweight local retrieval mechanism. Retrieve only relevant course sections for AI evaluation rather than sending whole course documents. Cache extracted content, embeddings if used, and evaluation results. Avoid paid vector databases unless demonstrated need justifies one. Keep source references traceable to uploaded documents.

#### User-selected online deployment architecture

The user prefers an online dashboard deployed on Vercel, code on GitHub, and Supabase for storage. This is a reconstructed stack decision; the original stack remains unrecovered. The implementation uses Next.js App Router/TypeScript, Supabase Auth/Postgres/private Storage, workspace-scoped RLS, and Postgres full-text search. The user deployed the app on Vercel and selected Mesaintelligence in Ravi Org as its database. Source is in the private Bdsravitejareddy GitHub repository. Credentials are not committed. The user confirmed both approved dashboard logins work. Two user-approved email addresses have equal access to one private workspace; membership requires verified Auth email and a private database invitation, with no authorization based on editable user metadata. AI rubric drafting and evaluation remain disabled until a provider is configured and data processing is approved. Do not send submissions or course excerpts to a hosted model without that approval.

SQLite FTS was the addendum's lightweight local retrieval option. For the selected Vercel deployment, Postgres full-text search is used instead of relying on local serverless filesystems. Preserve source/page/slide provenance and retrieve only relevant excerpts.

## LMS data source and synchronization

The authenticated Mesa LMS at `https://students.mesaschool.co.in/student/lms` is the primary source for courses, assessments, marks, feedback, rubrics, and course content. Explore available UI sections and authenticated endpoints only as permitted by the user and the LMS. Prefer stable, documented interfaces or an LMS-provided integration. Do not reverse-engineer controls or bypass access restrictions.

Design a once-daily synchronization job for marks, feedback, rubrics, and course content. Use a secure, persistent authentication mechanism supported by the LMS. Never store plaintext credentials, cookies, session tokens, or other secrets in the repository. Store only necessary data, retain source references and timestamps, and make synchronization idempotent with visible failures and retry handling.

The currently inspected UI exposes navigation for Courses, My Work, Attendance & Grade, and Documents. Course pages expose Outlines, Resources, Class Recordings, Announcements, and About. The current Documents page showed administrative PDFs; no official data endpoint has yet been verified. These observations are discovery notes, not a complete LMS schema or endpoint contract.

## Selected Drive source ingestion

Use a standalone, source-account-owned Apps Script installation for selected personal and Mesa/shared Drive roots. Either approved dashboard member manages the same shared connectors and imported records. Configure roots as a course or a collection of course subfolders, with an explicit course title for files directly under a collection. Preserve folder resource keys from supported links, source IDs, versions, links, and page/slide references. Folder edits do not require reinstallation.

The installer uses an expiring, single-use pairing code and a revocable connector token held in private Script Properties. Google credentials stay in Google; the server-only Supabase secret stays in deployment secrets. Read-only Drive consent covers the source account while the importer processes only configured roots. Installation starts the first import and creates one daily trigger; bounded continuations handle backlogs. No browser or local computer must remain open. Shared drives, shortcut cycles, permission errors, source unavailability, quotas, unsupported formats, and partial scans must remain visible and must never erase prior complete material versions.

Import PDF/PPTX and export native Docs/Slides to PDF/PPTX. Preserve the 20 MB stored-file and 10 MB Google-export limits. Other formats remain explicit unsupported inventory. Three non-transient parse failures pause retries until a source version changes or a member retries it. Keep inventory and extraction outcomes separate; do not imply empty/image-only files were understood. Do not infer official rubric criteria, marks, learning objectives, or assessment links from filenames. LMS ingestion and Module I remain separate, preserved requirements.

Production schema and server credentials are released, Google consent and pairing are complete, and real PDF/PPTX imports and unattended timed continuations have been observed. The initial collection backfill is in progress; detailed acceptance evidence and outstanding limitations are recorded in `IMPLEMENTATION_STATUS.md`. Dashboard login and Google authorisation remain separate checks. AI processing stays disabled.

## MVP acceptance criteria recovered from the addendum

- Upload a course PDF or PPTX.
- Extract and index its content.
- Associate materials with a course and assessment.
- Generate a rubric grounded in supplied materials.
- Evaluate a written answer using relevant course content.
- Verify numerical calculations where applicable.
- Produce separate academic, analytical, and professional evaluations.
- Show source references for major findings.
- Compare official marks against AI evaluations.
- Handle missing rubrics and incomplete course materials honestly.
- Display topic-level strengths and weaknesses.

Include daily marks ingestion and preserve SWOT, correlations, resume gap analysis, and the objective quality checker. The original A–H acceptance criteria are missing and must be recovered before claiming the full original acceptance suite is satisfied.

## Implementation priority

Course-grounded evaluation is P0 and central to the product. Build the minimum working workflow listed above first. Preserve all known original features, including daily marks ingestion, SWOT, correlations, resume gap analysis, and the quality checker. Avoid unnecessarily complex RAG infrastructure.

## Open requirements to recover

- Full original modules A–H, their behaviors, and original acceptance criteria.
- Original analytical integrity rules and detailed technical architecture.
- The platform repository, repository URL, and established runtime/stack.
- The LMS's documented or otherwise permitted stable data interface, authentication method, rate limits, and data retention constraints.
- Which professional roles and industry standards users may select for readiness evaluation.
- Who may view, edit, approve, or export student submissions, marks, feedback, and evaluations.
