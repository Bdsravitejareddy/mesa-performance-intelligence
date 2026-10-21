import { AppShell } from "@/components/app-shell";
import { demoData } from "@/lib/demo-data";
import { formatOfficialMark } from "@/lib/scoring";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { LmsSyncAction } from "@/components/lms-sync-action";
import Link from "next/link";
import { EvaluationSummary, getSummaryReferences, isEvaluationSummaryData } from "@/components/evaluation-summary";

export const dynamic = "force-dynamic";

export default async function MarksPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const items = demoMode ? demoData.assessments.map((item) => ({ id: item.id, title: item.title, course: item.course, mark: item.mark, feedback: "Illustrative evaluator note: connect the conclusion to the evidence and state key assumptions.", sourceMark: null as number | null, sourceMaximum: null as number | null })) : await loadMarks();
  const lastSync = demoMode ? null : await loadLastSync();
  return <AppShell demoMode={demoMode}><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> OFFICIAL RESULTS AND FEEDBACK</div><h1>Marks & feedback</h1><p className="page-subtitle">Official scores remain on their original 0–100 scale. AI comparisons require matching criterion evidence.</p></div>{!demoMode && <LmsSyncAction />}</div>
    {!demoMode && <div className="info-callout" role="status">{lastSync ? `Last LMS sync: ${lastSync.status} · ${new Date(lastSync.finished_at ?? lastSync.started_at).toLocaleString()} · ${lastSync.message}` : "LMS sync has not run yet. Use Sync Mesa LMS now to test the connection."}</div>}
    <section className="content-panel"><h2>Recorded marks <span className="panel-count">{items.length}</span></h2>{items.length ? <div className="marks-table">{items.map((item) => <article className="mark-feedback-row" key={item.id}><div><strong>{item.title}</strong><small>{item.course}{"source" in item && item.source ? ` · ${item.source}` : ""}</small></div><div className="mark-result"><strong className="mark-pill">{formatOfficialMark(item.mark)}</strong>{item.sourceMark !== null && item.sourceMaximum !== null && (item.sourceMark !== item.mark || item.sourceMaximum !== 100) && <small className="mark-original">LMS mark: {item.sourceMark}/{item.sourceMaximum}</small>}</div><p>{item.feedback || "No official feedback recorded."}</p>{"evaluationSummary" in item && <EvaluationSummary submissionId={item.id} summary={item.evaluationSummary} sourceReferences={item.sourceReferences} sampleCount={1} documents={[]} />}{"courseId" in item && <Link className="text-link" href={`/courses/${item.courseId}`}>Open course and assessment evidence</Link>}</article>)}</div> : <div className="empty-copy"><p>No official marks have been entered or imported. Use the course assessment record to add marks and evaluator feedback.</p></div>}</section>
    <div className="info-callout">A difference between an AI estimate and an official mark is a prompt to inspect the criterion, rubric, and source evidence. It does not by itself show that the official grade is wrong.</div>
    {demoMode && <p className="scope-note">All scores and feedback shown in preview mode are synthetic examples.</p>}
  </div></AppShell>;
}

async function loadLastSync() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("sync_runs").select("status,started_at,finished_at,message").eq("source_name", "Mesa Nexus MCP").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Could not load LMS sync status.");
  return data;
}

async function loadMarks() {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const [{ data: submissions, error }, { data: assessments }, { data: courses }] = await Promise.all([
    supabase.from("submissions").select("id, assessment_id, official_mark, source_original_mark, source_original_max_mark, official_feedback, official_mark_source").not("official_mark", "is", null).order("submitted_at", { ascending: false }),
    supabase.from("assessments").select("id, course_id, title"),
    supabase.from("courses").select("id, title"),
  ]);
  if (error) throw new Error("Could not load marks.");
  const assessmentById = new Map((assessments ?? []).map((item) => [item.id, item]));
  const courseById = new Map((courses ?? []).map((item) => [item.id, item.title]));
  const submissionIds = (submissions ?? []).map((item) => item.id);
  const { data: reports } = submissionIds.length ? await supabase.from("evaluation_reports").select("id, submission_id, report, created_at").in("submission_id", submissionIds).order("created_at", { ascending: false }) : { data: [] };
  const latestReport = new Map<string, unknown>();
  for (const report of reports ?? []) if (!latestReport.has(report.submission_id)) latestReport.set(report.submission_id, report.report);
  return (submissions ?? []).map((item) => {
    const assessment = assessmentById.get(item.assessment_id);
    const stored = latestReport.get(item.id) as Record<string, unknown> | undefined;
    const evaluation = stored && typeof stored === "object" ? stored : {};
    return { id: item.id, title: assessment?.title ?? "Assessment", course: assessment ? courseById.get(assessment.course_id) ?? "Course" : "Course", courseId: assessment?.course_id ?? "", assessmentId: assessment?.id ?? "", mark: Number(item.official_mark), feedback: item.official_feedback, source: item.official_mark_source, sourceMark: item.source_original_mark === null ? null : Number(item.source_original_mark), sourceMaximum: item.source_original_max_mark === null ? null : Number(item.source_original_max_mark), evaluationSummary: isEvaluationSummaryData(evaluation.summary) ? evaluation.summary : null, sourceReferences: getSummaryReferences(evaluation.sourceReferences) };
  });
}
