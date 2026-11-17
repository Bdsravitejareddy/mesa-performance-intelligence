import Link from "next/link";
import { isProviderConfigured } from "@/lib/ai/settings";
import { loadRelatedCourseIds } from "@/lib/courses/links";
import { ArrowLeft, BookOpen, FileText, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssessmentCreateForm, CourseMaterialUploader } from "@/components/course-forms";
import { SubmissionForm } from "@/components/submission-form";
import { RubricActions } from "@/components/rubric-actions";
import { EvaluationAction } from "@/components/evaluation-action";
import { MaterialProvenance } from "@/components/material-provenance";
import { getLmsAttachmentStatus, getSummaryReferences, isEvaluationSummaryData } from "@/components/evaluation-summary";
import { demoData } from "@/lib/demo-data";
import { stakesOf } from "@/lib/assessments/stakes";
import { courseSummary, groupDuplicates, maxLabel } from "@/lib/courses/summary";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  if (demoMode) {
    const course = demoData.courses.find((item) => item.id === id);
    if (!course) notFound();
    return <AppShell demoMode><div className="section-page"><Link className="back-link" href="/courses"><ArrowLeft size={14} /> Courses</Link><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {course.code} · ILLUSTRATIVE</div><h1>{course.title}</h1><p className="page-subtitle">Preview materials and assessments are synthetic examples, not LMS records.</p></div></div><div className="section-two-column"><div className="content-panel"><h2>Course materials</h2><div className="info-callout">{course.materials} illustrative materials are represented in preview data. Uploading is disabled in preview mode.</div><div className="material-placeholder"><BookOpen size={18} /><span>Course PDF/PPTX upload, extraction, source references, and assessment linkage are available after configuring Supabase.</span></div></div><aside className="content-panel"><h2>Assessments</h2>{demoData.assessments.filter((item) => item.course === course.title).map((item) => <div className="assessment-list-row" key={item.id}><FileText size={15} /><span><strong>{item.title}</strong><small>{item.format} · {item.mark}/100 illustrative</small></span></div>)}</aside></div></div></AppShell>;
  }
  if (!hasSupabaseConfig()) return <AppShell demoMode={false}><div className="section-page"><div className="info-callout">Connect the private Supabase workspace before opening a course.</div></div></AppShell>;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : undefined;
  const relatedIds = await loadRelatedCourseIds(supabase, id);
  const [{ data: course }, { data: materials }, { data: assessments }, { data: cards }] = await Promise.all([
    supabase.from("courses").select("id, code, title, term").eq("id", id).maybeSingle(),
    supabase.from("course_materials").select("id, name, version, drive_source_id, source_kind, assessment_id, extraction_status, created_at").in("course_id", relatedIds).order("created_at", { ascending: false }),
    supabase.from("assessments").select("id, title, assessment_format, official_max_mark, counts_toward_grade, due_at").eq("course_id", id).order("created_at", { ascending: false }),
    supabase.from("lms_report_cards").select("term, courses, breakdown").order("term", { ascending: false }),
  ]);
  if (!course) notFound();
  const sourceIds = [...new Set((materials ?? []).flatMap(m => m.drive_source_id ? [m.drive_source_id] : []))];
  const materialIds = (materials ?? []).map((material) => material.id);
  const [{ data: sourceRows }, { data: matchRows }] = await Promise.all([
    sourceIds.length ? supabase.from("drive_sources").select("id, drive_file_id, metadata, current_material_id, available").in("id", sourceIds) : Promise.resolve({ data: [] }),
    materialIds.length ? supabase.from("material_submission_matches").select("material_id, kind").in("material_id", materialIds) : Promise.resolve({ data: [] }),
  ]);
  // The student's own submitted workbooks are listed apart from what the course handed out.
  const submittedMaterial = new Set((matchRows ?? []).filter((row) => row.kind === "submission").map((row) => row.material_id as string));
  const sourcesById = new Map((sourceRows ?? []).map(source => [source.id, source]));
  const assessmentOptions = assessments ?? [];
  const assessmentIds = assessmentOptions.map((item) => item.id);
  const [{ data: rubricRows }, { data: submissions }, { data: roleProfiles }] = await Promise.all([
    assessmentIds.length ? supabase.from("rubrics").select("id, assessment_id, source_kind, approval_status, maximum_marks").in("assessment_id", assessmentIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    assessmentIds.length ? supabase.from("submissions").select("id, assessment_id, official_mark, official_feedback, official_mark_source, source_original_max_mark, created_at").in("assessment_id", assessmentIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("role_profiles").select("id, title").order("created_at", { ascending: false }),
  ]);
  const rubricIds = (rubricRows ?? []).map((item) => item.id);
  const { data: criterionRows } = rubricIds.length ? await supabase.from("rubric_criteria").select("id, rubric_id, title, description, weight, maximum_marks, source_reference").in("rubric_id", rubricIds) : { data: [] };
  const rubricsByAssessment = new Map(assessmentIds.map((assessmentId) => [assessmentId, (rubricRows ?? []).filter((item) => item.assessment_id === assessmentId).map((item) => ({ ...item, maximum_marks: Number(item.maximum_marks), rubric_criteria: (criterionRows ?? []).filter((criterion) => criterion.rubric_id === item.id) }))]));
  const submissionIds = (submissions ?? []).map((item) => item.id);
  const { data: submissionDocuments } = submissionIds.length ? await supabase.from("submission_documents").select("id, submission_id, name, source_kind, extraction_status, source_version").in("submission_id", submissionIds).order("created_at", { ascending: true }) : { data: [] };
  const submissionMaterials = (materials ?? []).filter((material) => material.extraction_status === "complete" || material.extraction_status === "needs_visual_review");
  const { data: evaluationRows } = submissionIds.length ? await supabase.from("evaluation_reports").select("id, submission_id, mesa_academic_score, analytical_score, professional_score, status, report").in("submission_id", submissionIds).order("created_at", { ascending: false }) : { data: [] };
  const evaluationIds = (evaluationRows ?? []).map((item) => item.id);
  const { data: evidenceRows } = evaluationIds.length ? await supabase.from("evaluation_evidence").select("evaluation_id, layer, criterion, finding, submission_quote, confidence, material_references(reference_label)").in("evaluation_id", evaluationIds).order("created_at", { ascending: true }) : { data: [] };
  const evidenceByEvaluation = new Map(evaluationIds.map((evaluationId) => [evaluationId, (evidenceRows ?? []).filter((item) => item.evaluation_id === evaluationId)]));
  const reportsBySubmission = new Map(submissionIds.map((submissionId) => [submissionId, (evaluationRows ?? []).filter((item) => item.submission_id === submissionId).map((item) => {
    const report = item.report && typeof item.report === "object" ? item.report as Record<string, unknown> : {};
    return { ...item, report: { ...report, summary: isEvaluationSummaryData(report.summary) ? report.summary : undefined, sourceReferences: getSummaryReferences(report.sourceReferences) }, evidence: evidenceByEvaluation.get(item.id) ?? [] };
  })]));
  const aiEnabled = isProviderConfigured();
  const marks = new Map<string, number>();
  for (const submission of submissions ?? []) if (submission.official_mark !== null && !marks.has(submission.assessment_id)) marks.set(submission.assessment_id, Number(submission.official_mark));
  const summary = courseSummary({ title: course.title, cards: (cards ?? []) as Parameters<typeof courseSummary>[0]["cards"], assessments: assessmentOptions, marks });
  const linkable = (assessmentId: string) => submissionMaterials.filter((item) => !item.assessment_id || item.assessment_id === assessmentId).map((item) => ({ id: item.id, name: item.name, sourceKind: item.drive_source_id ? "drive" : item.source_kind, version: item.version }));
  const own = (materials ?? []).filter((material) => submittedMaterial.has(material.id));
  const given = (materials ?? []).filter((material) => !submittedMaterial.has(material.id));
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
  const materialRow = ({ item: material, copies }: { item: NonNullable<typeof materials>[number]; copies: NonNullable<typeof materials> }) => { const source = sourcesById.get(material.drive_source_id); return <div className="material-row" key={material.id}><FileText size={16} /><span><MaterialProvenance name={material.name} version={material.version} sourceKind={material.source_kind} extractionStatus={material.extraction_status} driveFileId={source?.drive_file_id} sourceUrl={source?.metadata?.sourceUrl} available={source?.available} current={material.drive_source_id ? source?.current_material_id === material.id : undefined} />{copies.length > 0 && <details className="material-copies"><summary>{copies.length} more cop{copies.length === 1 ? "y" : "ies"} of this file</summary>{copies.map((copy) => <small key={copy.id}>{copy.name} · v{copy.version} · {date(copy.created_at)}</small>)}</details>}</span><time>{date(material.created_at)}</time></div>; };
  const strongestLine = summary.strongest && summary.weakest ? <p>{summary.basis === "report_card" ? "On the report card's components" : "On released official marks"}, strongest: <b>{summary.strongest.name}</b> ({summary.strongest.detail}); weakest: <b>{summary.weakest.name}</b> ({summary.weakest.detail}).{summary.basis === "assessment_marks" ? " Each is one assessment, not a verdict on the whole course." : ""}</p> : null;
  return <AppShell demoMode={false}><div className="section-page course-page"><Link className="back-link" href="/courses"><ArrowLeft size={14} /> Courses</Link><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {course.code || "COURSE"} {course.term ? `· ${course.term}` : ""}</div><h1>{course.title}</h1><p className="page-subtitle">{summary.graded} graded assessment{summary.graded === 1 ? "" : "s"}{summary.practice ? ` and ${summary.practice} practice task${summary.practice === 1 ? "" : "s"}` : ""} · {given.length} course material{given.length === 1 ? "" : "s"}{own.length ? ` · ${own.length} of your submitted files` : ""}</p></div></div>
    <section className="content-panel course-summary" aria-label="Course at a glance"><h2>At a glance</h2>
      <div className="course-summary-tiles">
        <div><span>Official result</span><strong>{summary.official?.percentage !== null && summary.official?.percentage !== undefined ? `${summary.official.percentage}%` : "—"}</strong><small>{summary.official ? [summary.official.grade && `grade ${summary.official.grade}`, summary.official.credits !== null && `${summary.official.credits} credits`, summary.official.term].filter(Boolean).join(" · ") : "not on a report card yet"}</small></div>
        <div><span>Marks released</span><strong>{summary.released}<small> of {summary.graded}</small></strong><small>graded assessments{summary.practice ? `; ${summary.practice} practice tasks not counted` : ""}</small></div>
        <div><span>Still to come</span><strong>{summary.upcoming + summary.awaiting}</strong><small>{[summary.upcoming && `${summary.upcoming} due${summary.next ? ` — next: ${summary.next.title}, ${date(summary.next.due)}` : ""}`, summary.awaiting && `${summary.awaiting} awaiting a mark`].filter(Boolean).join(" · ") || "nothing outstanding"}</small></div>
      </div>
      {strongestLine ?? <p className="empty-hint">Too few released marks to say where this course is strongest or weakest.</p>}
      <p className="scope-note">Official figures only, from the Nexus report card and released marks. AI grades are on Graded work and are never mixed in here.</p>
    </section>
    <div className="section-two-column"><section className="content-panel"><h2>Course materials <span className="panel-count">{given.length}</span></h2>{given.length ? groupDuplicates(given).map(materialRow) : <div className="empty-copy"><p>No course materials indexed yet. Upload a syllabus, lecture slides, notes, rubric, or assessment paper.</p></div>}
      {own.length > 0 && <><h3 className="material-subhead">Your submitted work <span className="panel-count">{own.length}</span></h3><p className="empty-hint">Files matched as your own submissions. They are graded as your work, not used as course material.</p>{groupDuplicates(own).map(materialRow)}</>}
      <details className="assessment-edit"><summary>Upload course material</summary><CourseMaterialUploader courseId={course.id} userId={userId} assessments={assessmentOptions} demoMode={false} /></details></section>
      <aside className="content-panel"><h2>Assessments <span className="panel-count">{summary.graded}{summary.practice ? ` + ${summary.practice} practice` : ""}</span></h2>{assessmentOptions.map((assessment) => { const subs = (submissions ?? []).filter((submission) => submission.assessment_id === assessment.id); const mark = marks.get(assessment.id); const original = subs.find((submission) => submission.official_mark !== null)?.source_original_max_mark; const practice = stakesOf(assessment.title, assessment.counts_toward_grade ?? true) === "practice"; return <div className="assessment-workspace" key={assessment.id}><div className="assessment-list-row"><FileText size={15} /><span><strong>{assessment.title}</strong><small>{[practice ? "Practice" : "Graded", assessment.assessment_format, mark === undefined ? `${maxLabel(assessment.official_max_mark, original)} · no mark released` : `official mark ${mark} ${maxLabel(assessment.official_max_mark, original)}`].filter(Boolean).join(" · ")}</small></span></div>
        {subs.map((submission) => { const documents = (submissionDocuments ?? []).filter((document) => document.submission_id === submission.id).map((document) => ({ id: document.id, name: document.name, sourceKind: document.source_kind, extractionStatus: document.extraction_status, sourceVersion: document.source_version })); const lmsAttachmentStatus = getLmsAttachmentStatus(submission.official_mark_source); return <article className="submission-record" key={submission.id}><small>{submission.official_mark === null ? "No official mark" : `Official mark: ${submission.official_mark}/100`}{submission.official_mark_source ? ` · ${submission.official_mark_source}` : ""}{submission.official_feedback ? ` · ${submission.official_feedback}` : ""}</small>{documents.length > 0 && <div className="submission-document-list">{documents.map((document) => <div className="submission-document-row" key={document.id}><span><b>{document.name}</b><small>{document.sourceKind} · {document.extractionStatus.replaceAll("_", " ")} · {document.sourceVersion}</small></span></div>)}</div>}{lmsAttachmentStatus === "unavailable" && !documents.length && <small className="scope-note">No submitted file yet — the LMS does not share it. Attach it under Edit.</small>}{(reportsBySubmission.get(submission.id) ?? []).length > 0 && <EvaluationAction submissionId={submission.id} roleProfiles={roleProfiles ?? []} documents={documents} lmsAttachmentStatus={lmsAttachmentStatus} reports={reportsBySubmission.get(submission.id) ?? []} />}</article>; })}
        {/* Admin and editing tools sit behind one disclosure per assessment, so the page reads as a course, not a form. */}
        <details className="assessment-edit"><summary>Edit</summary>
          <RubricActions assessmentId={assessment.id} rubrics={rubricsByAssessment.get(assessment.id) ?? []} officialMaterials={(materials ?? []).filter((item) => item.source_kind === "rubric" && (!item.assessment_id || item.assessment_id === assessment.id)).map(({ id: materialId, name }) => ({ id: materialId, name }))} disabled={!aiEnabled} />
          <details className="submission-details"><summary>Add submission, official mark, feedback, and file</summary><SubmissionForm key={`${assessment.id}-${submissions?.length ?? 0}`} assessmentId={assessment.id} courseMaterials={linkable(assessment.id)} /></details>
          {subs.map((submission) => { const documents = (submissionDocuments ?? []).filter((document) => document.submission_id === submission.id).map((document) => ({ id: document.id, name: document.name, sourceKind: document.source_kind, extractionStatus: document.extraction_status, sourceVersion: document.source_version })); const lmsAttachmentStatus = getLmsAttachmentStatus(submission.official_mark_source); return <div key={submission.id}><details id={`submission-files-${submission.id}`} className="submission-details" open={lmsAttachmentStatus === "unavailable"}><summary>Attach or manage submission files</summary><SubmissionForm assessmentId={assessment.id} submissionId={submission.id} documents={documents} lmsAttachmentStatus={lmsAttachmentStatus} courseMaterials={linkable(assessment.id)} /></details>{!(reportsBySubmission.get(submission.id) ?? []).length && <EvaluationAction submissionId={submission.id} roleProfiles={roleProfiles ?? []} documents={documents} lmsAttachmentStatus={lmsAttachmentStatus} reports={[]} />}</div>; })}
        </details></div>; })}<details className="assessment-edit"><summary><Plus size={14} /> Add assessment</summary><AssessmentCreateForm courseId={course.id} /></details></aside></div>
    <p className="scope-note">Visual slides are flagged for review; add notes to describe important diagrams. This MVP does not infer image content automatically.</p>
  </div></AppShell>;
}
