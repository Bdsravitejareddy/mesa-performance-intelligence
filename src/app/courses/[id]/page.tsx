import Link from "next/link";
import { ArrowLeft, BookOpen, FileText, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssessmentCreateForm, CourseMaterialUploader } from "@/components/course-forms";
import { SubmissionForm } from "@/components/submission-form";
import { RubricActions } from "@/components/rubric-actions";
import { EvaluationAction } from "@/components/evaluation-action";
import { MaterialProvenance } from "@/components/material-provenance";
import { getSummaryReferences, isEvaluationSummaryData } from "@/components/evaluation-summary";
import { demoData } from "@/lib/demo-data";
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
  const [{ data: course }, { data: materials }, { data: assessments }] = await Promise.all([
    supabase.from("courses").select("id, code, title, term").eq("id", id).maybeSingle(),
    supabase.from("course_materials").select("id, name, version, drive_source_id, source_kind, assessment_id, extraction_status, created_at").eq("course_id", id).order("created_at", { ascending: false }),
    supabase.from("assessments").select("id, title, assessment_format, official_max_mark").eq("course_id", id).order("created_at", { ascending: false }),
  ]);
  if (!course) notFound();
  const sourceIds = [...new Set((materials ?? []).flatMap(m => m.drive_source_id ? [m.drive_source_id] : []))];
  const { data: sourceRows } = sourceIds.length ? await supabase.from("drive_sources").select("id, drive_file_id, metadata, current_material_id, available").in("id", sourceIds) : { data: [] };
  const sourcesById = new Map((sourceRows ?? []).map(source => [source.id, source]));
  const assessmentOptions = assessments ?? [];
  const assessmentIds = assessmentOptions.map((item) => item.id);
  const [{ data: rubricRows }, { data: submissions }, { data: roleProfiles }] = await Promise.all([
    assessmentIds.length ? supabase.from("rubrics").select("id, assessment_id, source_kind, approval_status, maximum_marks").in("assessment_id", assessmentIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    assessmentIds.length ? supabase.from("submissions").select("id, assessment_id, official_mark, official_feedback, official_mark_source, created_at").in("assessment_id", assessmentIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
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
  const aiEnabled = process.env.AI_DATA_PROCESSING_APPROVED === "true" && Boolean(process.env.AI_API_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL);
  return <AppShell demoMode={false}><div className="section-page"><Link className="back-link" href="/courses"><ArrowLeft size={14} /> Courses</Link><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {course.code || "COURSE"} {course.term ? `· ${course.term}` : ""}</div><h1>{course.title}</h1><p className="page-subtitle">Course materials are indexed for local full-text retrieval with page and slide references.</p></div></div>
    <div className="section-two-column"><section className="content-panel"><h2>Materials <span className="panel-count">{materials?.length ?? 0}</span></h2>{materials?.length ? materials.map((material) => <div className="material-row" key={material.id}><FileText size={16} /><MaterialProvenance name={material.name} version={material.version} sourceKind={material.source_kind} extractionStatus={material.extraction_status} driveFileId={sourcesById.get(material.drive_source_id)?.drive_file_id} sourceUrl={sourcesById.get(material.drive_source_id)?.metadata?.sourceUrl} available={sourcesById.get(material.drive_source_id)?.available} current={material.drive_source_id ? sourcesById.get(material.drive_source_id)?.current_material_id === material.id : undefined} /><time>{new Date(material.created_at).toLocaleDateString()}</time></div>) : <div className="empty-copy"><p>No course materials indexed yet. Upload a syllabus, lecture slides, notes, rubric, or assessment paper.</p></div>}<CourseMaterialUploader courseId={course.id} userId={userId} assessments={assessmentOptions} demoMode={false} /></section>
      <aside className="content-panel"><h2>Assessments <span className="panel-count">{assessmentOptions.length}</span></h2>{assessmentOptions.map((assessment) => <div className="assessment-workspace" key={assessment.id}><div className="assessment-list-row"><FileText size={15} /><span><strong>{assessment.title}</strong><small>{assessment.assessment_format} · {assessment.official_max_mark}/100</small></span></div><RubricActions assessmentId={assessment.id} rubrics={rubricsByAssessment.get(assessment.id) ?? []} officialMaterials={(materials ?? []).filter((item) => item.source_kind === "rubric" && (!item.assessment_id || item.assessment_id === assessment.id)).map(({ id: materialId, name }) => ({ id: materialId, name }))} disabled={!aiEnabled} /><details className="submission-details"><summary>Add submission, official mark, feedback, and file</summary><SubmissionForm key={`${assessment.id}-${submissions?.length ?? 0}`} assessmentId={assessment.id} courseMaterials={submissionMaterials.filter((item) => !item.assessment_id || item.assessment_id === assessment.id).map((item) => ({ id: item.id, name: item.name, sourceKind: item.drive_source_id ? "drive" : item.source_kind, version: item.version }))} /></details>{(submissions ?? []).filter((submission) => submission.assessment_id === assessment.id).map((submission) => { const documents = (submissionDocuments ?? []).filter((document) => document.submission_id === submission.id).map((document) => ({ id: document.id, name: document.name, sourceKind: document.source_kind, extractionStatus: document.extraction_status, sourceVersion: document.source_version })); return <article className="submission-record" key={submission.id}><strong>Saved evidence</strong><small>{submission.official_mark === null ? "No official mark" : `Official mark: ${submission.official_mark}/100`}{submission.official_mark_source ? ` · ${submission.official_mark_source}` : ""}{submission.official_feedback ? ` · ${submission.official_feedback}` : ""}</small>{documents.length > 0 && <div className="submission-document-list">{documents.map((document) => <div className="submission-document-row" key={document.id}><span><b>{document.name}</b><small>{document.sourceKind} · {document.extractionStatus.replaceAll("_", " ")} · {document.sourceVersion}</small></span></div>)}</div>}<details id={`submission-files-${submission.id}`} className="submission-details"><summary>Attach or manage submission files</summary><SubmissionForm assessmentId={assessment.id} submissionId={submission.id} documents={documents} courseMaterials={submissionMaterials.filter((item) => !item.assessment_id || item.assessment_id === assessment.id).map((item) => ({ id: item.id, name: item.name, sourceKind: item.drive_source_id ? "drive" : item.source_kind, version: item.version }))} /></details><EvaluationAction submissionId={submission.id} roleProfiles={roleProfiles ?? []} documents={documents} reports={reportsBySubmission.get(submission.id) ?? []} /></article>; })}</div>)}<div className="form-divider"><Plus size={14} /> Add assessment</div><AssessmentCreateForm courseId={course.id} /></aside></div>
    <p className="scope-note">Visual slides are flagged for review; add notes to describe important diagrams. This MVP does not infer image content automatically.</p>
  </div></AppShell>;
}
