import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { UnassignedLmsList } from "@/components/unassigned-lms";
import { CriterionBreakdown } from "@/components/criterion-breakdown";
import { SyncHealthNotice } from "@/components/sync-health-notice";
import { describeSyncHealth, type SyncRun } from "@/lib/lms/sync-health";
import { formatOfficialMark } from "@/lib/scoring";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Assessment = { id: string; course_id: string; title: string; assessment_format: string; source_record_id: string | null; created_at: string };
type Submission = { id: string; assessment_id: string; official_mark: number | string | null; source_original_mark: number | string | null; source_original_max_mark: number | string | null; official_feedback: string; official_mark_source: string; lms_submission_status: string; source_record_id: string | null; source_updated_at: string | null; submitted_at: string | null; created_at: string };
type Material = { course_id: string; extraction_status: string };

const NOT_CONNECTED = [
  { name: "Resume and work experience", note: "A resume claim is evidence of a claim, not verified proficiency." },
  { name: "Projects, portfolios and certifications", note: "Project outputs and measurable results will strengthen evidence once imported." },
  { name: "Mentor, interviewer and peer feedback", note: "Only official LMS feedback is imported today." },
  { name: "AI conversation exports", note: "Optional and consent-based; not collected." },
];

export default async function EvidencePage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const data = demoMode || !hasSupabaseConfig() ? null : await loadData();
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> PROVENANCE</div><h1>Evidence library</h1><p className="page-subtitle">Every record the platform reasons from, where it came from, and when.</p></div></div>
    {!data ? <section className="content-panel"><p className="empty-hint">{demoMode ? "Preview mode has no real evidence records." : "Connect Supabase to load evidence records."}</p></section> : <EvidenceContent data={data} />}
  </div></AppShell>;
}

function EvidenceContent({ data }: { data: Awaited<ReturnType<typeof loadData>> }) {
  const courseTitle = new Map(data.courses.map((course) => [course.id, course.title]));
  const submissionsByAssessment = new Map<string, Submission[]>();
  for (const row of data.submissions) submissionsByAssessment.set(row.assessment_id, [...(submissionsByAssessment.get(row.assessment_id) ?? []), row]);
  const marked = data.submissions.filter((row) => row.official_mark !== null).length;
  const withFeedback = data.submissions.filter((row) => row.official_feedback.trim()).length;
  const unmarked = data.assessments.filter((assessment) => !(submissionsByAssessment.get(assessment.id) ?? []).some((row) => row.official_mark !== null)).length;
  const materialsByCourse = new Map<string, { total: number; complete: number; review: number; failed: number }>();
  for (const material of data.materials) {
    const entry = materialsByCourse.get(material.course_id) ?? { total: 0, complete: 0, review: 0, failed: 0 };
    entry.total += 1;
    if (material.extraction_status === "complete") entry.complete += 1;
    else if (material.extraction_status === "failed") entry.failed += 1;
    else entry.review += 1;
    materialsByCourse.set(material.course_id, entry);
  }

  return <>
    <SyncHealthNotice health={data.syncHealth} />
    <section className="competency-summary" aria-label="Evidence coverage">
      <div className="competency-summary-item"><strong>{data.assessments.length}</strong><span>Assessments</span></div>
      <div className="competency-summary-item"><strong>{marked}</strong><span>Official marks</span></div>
      <div className="competency-summary-item"><strong>{unmarked}</strong><span>Assessments without a released mark</span></div>
      <div className="competency-summary-item"><strong>{withFeedback}</strong><span>Official feedback records</span></div>
      <div className="competency-summary-item"><strong>{data.materials.length}</strong><span>Course materials</span></div>
    </section>

    <section className="content-panel"><h2>Academic records <span className="panel-count">{data.assessments.length}</span></h2>
      <p className="empty-hint">Marks are shown on the official 0–100 scale with the LMS original alongside. An assessment without a released mark is listed as such; it is never counted as zero.</p>
      <div className="evidence-table" role="table" aria-label="Academic records">
        <div className="evidence-table-row evidence-table-head" role="row"><span role="columnheader">Assessment</span><span role="columnheader">Mark</span><span role="columnheader">Feedback</span><span role="columnheader">Source</span></div>
        {data.assessments.map((assessment) => {
          const rows = submissionsByAssessment.get(assessment.id) ?? [];
          const latest = [...rows].sort((a, b) => (b.source_updated_at ?? b.created_at).localeCompare(a.source_updated_at ?? a.created_at))[0];
          const mark = latest && latest.official_mark !== null ? Number(latest.official_mark) : null;
          return <div className="evidence-table-row" role="row" key={assessment.id}>
            <span role="cell"><strong>{assessment.title}</strong><small>{courseTitle.get(assessment.course_id) ?? "Course"} · {assessment.assessment_format}</small></span>
            <span role="cell">{mark === null ? <em>No released mark</em> : <><strong>{formatOfficialMark(mark)}</strong>{latest.source_original_mark !== null && latest.source_original_max_mark !== null && <small>LMS: {Number(latest.source_original_mark)}/{Number(latest.source_original_max_mark)}</small>}</>}{rows.length > 1 && <small>{rows.length} submission records</small>}</span>
            <span role="cell">{latest?.official_feedback.trim() ? <><small>{latest.official_feedback.trim().slice(0, 160)}{latest.official_feedback.trim().length > 160 ? "…" : ""}</small><CriterionBreakdown feedback={latest.official_feedback} overall={mark} /></> : <small>None recorded</small>}</span>
            <span role="cell"><small>{assessment.source_record_id ? "Mesa LMS" : "Manual entry"}{latest?.official_mark_source ? ` · ${latest.official_mark_source}` : ""}</small><small>{latest?.source_updated_at ? `LMS updated ${new Date(latest.source_updated_at).toLocaleDateString()}` : `Recorded ${new Date((latest ?? assessment).created_at).toLocaleDateString()}`}</small>{latest?.lms_submission_status && <small>Status: {latest.lms_submission_status}</small>}</span>
          </div>;
        })}
      </div>
    </section>

    {data.unassigned.length > 0 && <section className="content-panel"><h2>LMS assignments without a course <span className="panel-count">{data.unassigned.length}</span></h2>
      <p className="empty-hint">The LMS sent these with an empty course field, even in assignment-detail lookups. Each is filed automatically when its title names exactly one course; otherwise pick the course once and it is imported straight away. Later syncs keep the choice.</p>
      <UnassignedLmsList courses={data.lmsCourses} items={data.unassigned.map((row) => ({ id: row.id, title: row.title, detail: [row.record.status, row.record.score === null || row.record.score === undefined ? "no released mark" : `${row.record.score}/100`].filter(Boolean).join(" · "), suggestedCourseId: row.suggested_course_id, basis: row.resolved_course_id ? "" : row.suggestion_basis, resolvedCourse: row.resolved_course_id ? courseTitle.get(row.resolved_course_id) ?? "Course" : null, resolution: row.resolution }))} />
    </section>}

    <section className="content-panel"><h2>Course materials <span className="panel-count">{data.materials.length}</span></h2>
      <p className="empty-hint">{data.linkCount ? `${data.linkCount} Drive course${data.linkCount > 1 ? "s are" : " is"} linked and shown under the LMS course.` : "Drive courses are not linked to LMS courses yet, so assessments cannot use their materials."} <Link className="text-link" href="/courses">Review course links</Link> · <Link className="text-link" href="/materials/review">Review flagged slides</Link></p>
      {data.courses.length ? <div className="evidence-materials">{data.courses.map((course) => {
        const counts = materialsByCourse.get(course.id);
        return <Link href={`/courses/${course.id}`} className="evidence-material-row" key={course.id}><strong>{course.title}</strong><small>{counts ? `${counts.total} documents · ${counts.complete} extracted${counts.review ? ` · ${counts.review} need review` : ""}${counts.failed ? ` · ${counts.failed} failed` : ""}` : "No materials"}</small></Link>;
      })}</div> : <p className="empty-hint">No courses recorded.</p>}
    </section>

    <section className="content-panel"><h2>Sync history <span className="panel-count">{data.runs.length}</span></h2>
      {data.runs.length ? <ul className="evidence-runs">{data.runs.map((run, index) => <li key={`${run.started_at}-${index}`}><strong>{run.status}</strong> <small>{new Date(run.started_at).toLocaleString()}</small><p>{run.message}</p></li>)}</ul> : <p className="empty-hint">No LMS sync has run.</p>}
    </section>

    <section className="content-panel"><h2>Not yet connected</h2><p className="empty-hint">These evidence types are part of the plan but have no imported records. Their absence is not counted against any competency.</p>
      <ul className="evidence-runs">{NOT_CONNECTED.map((item) => <li key={item.name}><strong>{item.name}</strong><p>{item.note}</p></li>)}</ul>
    </section>
  </>;
}

async function loadData() {
  const supabase = await createClient();
  const [courses, assessments, submissions, materials, links, unassigned, runs] = await Promise.all([
    supabase.from("courses").select("id, title").order("title"),
    supabase.from("assessments").select("id, course_id, title, assessment_format, source_record_id, created_at").order("created_at", { ascending: false }),
    supabase.from("submissions").select("id, assessment_id, official_mark, source_original_mark, source_original_max_mark, official_feedback, official_mark_source, lms_submission_status, source_record_id, source_updated_at, submitted_at, created_at"),
    supabase.from("course_materials").select("course_id, extraction_status"),
    supabase.from("course_links").select("assessment_course_id, material_course_id"),
    supabase.from("lms_unassigned_assignments").select("id, title, record, suggested_course_id, suggestion_basis, resolved_course_id, resolution").order("title"),
    supabase.from("sync_runs").select("status, started_at, finished_at, message").eq("source_name", "Mesa Nexus MCP").order("started_at", { ascending: false }).limit(20),
  ]);
  const error = courses.error ?? assessments.error ?? submissions.error ?? materials.error ?? links.error ?? unassigned.error ?? runs.error;
  if (error) throw new Error("Could not load evidence records.");
  const syncRuns = (runs.data ?? []) as SyncRun[];
  // Show linked Drive materials under the LMS course they were confirmed for.
  const linkedTo = new Map((links.data ?? []).map((link) => [link.material_course_id as string, link.assessment_course_id as string]));
  const linkedMaterialCourses = new Set(linkedTo.keys());
  return {
    assessments: (assessments.data ?? []) as Assessment[],
    submissions: (submissions.data ?? []) as Submission[],
    materials: ((materials.data ?? []) as Material[]).map((material) => ({ ...material, course_id: linkedTo.get(material.course_id) ?? material.course_id })),
    courses: ((courses.data ?? []) as { id: string; title: string }[]).filter((course) => !linkedMaterialCourses.has(course.id)),
    linkCount: linkedTo.size,
    unassigned: (unassigned.data ?? []) as { id: string; title: string; record: { score?: number | null; status?: string; sourceScore?: number | null; sourceMaximumMark?: number | null }; suggested_course_id: string | null; suggestion_basis: string; resolved_course_id: string | null; resolution: string | null }[],
    lmsCourses: ((courses.data ?? []) as { id: string; title: string }[]).filter((course) => !linkedMaterialCourses.has(course.id)),
    runs: syncRuns.slice(0, 10),
    syncHealth: describeSyncHealth(syncRuns),
  };
}
