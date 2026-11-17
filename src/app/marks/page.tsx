import { CountsTowardGrade } from "@/components/counts-toward-grade";
import { AppShell } from "@/components/app-shell";
import { demoData } from "@/lib/demo-data";
import { formatOfficialMark } from "@/lib/scoring";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedRead } from "@/lib/data/cached";
import { LmsSyncAction } from "@/components/lms-sync-action";
import Link from "next/link";
import { CriterionBreakdown } from "@/components/criterion-breakdown";
import { SyncHealthNotice } from "@/components/sync-health-notice";
import { describeSyncHealth, type SyncRun } from "@/lib/lms/sync-health";
import { NEEDS_BROWSER, type MessageLink } from "@/lib/lms/messages";
import { ReportCards, type ReportCardRow } from "@/components/report-cards";
import { FeedbackSummary, type AiFeedback } from "@/components/feedback-summary";
import { EvaluationSummary, getSummaryReferences, isEvaluationSummaryData } from "@/components/evaluation-summary";

export const dynamic = "force-dynamic";

export default async function MarksPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const items = demoMode ? demoData.assessments.map((item) => ({ id: item.id, title: item.title, course: item.course, mark: item.mark, feedback: "Illustrative evaluator note: connect the conclusion to the evidence and state key assumptions.", sourceMark: null as number | null, sourceMaximum: null as number | null })) : await loadMarks();
  const syncHealth = demoMode ? null : await loadSyncHealth();
  const messages = demoMode ? [] : await cachedRead("marks:nexus-messages", loadMessages).catch(() => []);
  const reportCards = demoMode ? [] : await cachedRead("marks:report-cards", loadReportCards).catch(() => []);
  return <AppShell demoMode={demoMode}><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> OFFICIAL RESULTS AND FEEDBACK</div><h1>Marks & feedback</h1><p className="page-subtitle">Official scores remain on their original 0–100 scale. AI comparisons require matching criterion evidence.</p></div>{!demoMode && <LmsSyncAction />}</div>
    {syncHealth && <SyncHealthNotice health={syncHealth} />}
    <ReportCards cards={reportCards} />
    {messages.length > 0 && <section className="content-panel nexus-messages"><h2>Links from Nexus <span className="panel-count">{messages.length}</span></h2>
      <p>From your Nexus notifications and announcements. Pages behind your Google sign-in can’t be read by the daily sync; ask Claude to read them in your browser, and they are imported from there.</p>
      <ul>{messages.map((message) => <li key={message.id}><strong>{message.title || "Notification"}</strong><small>{message.kind === "announcement" ? "Announcement" : "Notification"}{message.course ? ` · ${message.course}` : ""}{message.posted_at ? ` · ${new Date(message.posted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</small>
        {message.links.map((link) => <span key={link.url} className="nexus-link"><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a>{NEEDS_BROWSER.includes(link.kind) ? " — needs a read in your browser" : ""}</span>)}</li>)}</ul>
    </section>}
    <section className="content-panel"><h2>Recorded marks <span className="panel-count">{items.length}</span></h2>{items.length ? <div className="marks-table">{items.map((item) => <article className="mark-feedback-row" key={item.id}><div><strong>{item.title}</strong><small>{item.course}{"source" in item && item.source ? ` · ${item.source}` : ""}</small>{"countsTowardGrade" in item && item.assessmentId && <CountsTowardGrade assessmentId={item.assessmentId} counts={item.countsTowardGrade} />}</div><div className="mark-result"><strong className="mark-pill">{formatOfficialMark(item.mark)}</strong>{item.sourceMark !== null && item.sourceMaximum !== null && (item.sourceMark !== item.mark || item.sourceMaximum !== 100) && <small className="mark-original">LMS mark: {item.sourceMark}/{item.sourceMaximum}</small>}</div>{item.feedback && <CriterionBreakdown feedback={item.feedback} overall={item.mark} />}<FeedbackSummary feedback={item.feedback ?? ""} source={"source" in item ? String(item.source ?? "") : ""} ai={"ai" in item ? item.ai : null} />{"evaluationSummary" in item && <EvaluationSummary submissionId={item.id} summary={item.evaluationSummary} sourceReferences={item.sourceReferences} sampleCount={1} documents={[]} />}{"courseId" in item && <Link className="text-link" href={`/courses/${item.courseId}`}>Open course and assessment evidence</Link>}</article>)}</div> : <div className="empty-copy"><p>No official marks have been entered or imported. Use the course assessment record to add marks and evaluator feedback.</p></div>}</section>
    <div className="info-callout">A difference between an AI estimate and an official mark is a prompt to inspect the criterion, rubric, and source evidence. It does not by itself show that the official grade is wrong.</div>
    {demoMode && <p className="scope-note">All scores and feedback shown in preview mode are synthetic examples.</p>}
  </div></AppShell>;
}

async function loadSyncHealth() {
  if (!hasSupabaseConfig()) return null;
  return cachedRead("marks:loadSyncHealth", loadSyncHealthWith);
}

async function loadSyncHealthWith(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("sync_runs").select("status,started_at,finished_at,message").eq("source_name", "Mesa Nexus MCP").order("started_at", { ascending: false }).limit(20);
  if (error) throw new Error("Could not load LMS sync status.");
  return describeSyncHealth((data ?? []) as SyncRun[]);
}

async function loadMarks() {
  if (!hasSupabaseConfig()) return [];
  return cachedRead("marks:loadMarks", loadMarksWith);
}

async function loadMarksWith(supabase: SupabaseClient) {
  const [{ data: submissions, error }, { data: assessments }, { data: courses }] = await Promise.all([
    supabase.from("submissions").select("id, assessment_id, official_mark, source_original_mark, source_original_max_mark, official_feedback, official_mark_source").not("official_mark", "is", null).order("submitted_at", { ascending: false }),
    supabase.from("assessments").select("id, course_id, title, counts_toward_grade"),
    supabase.from("courses").select("id, title"),
  ]);
  if (error) throw new Error("Could not load marks.");
  const assessmentById = new Map((assessments ?? []).map((item) => [item.id, item]));
  const courseById = new Map((courses ?? []).map((item) => [item.id, item.title]));
  const submissionIds = (submissions ?? []).map((item) => item.id);
  const { data: reports } = submissionIds.length ? await supabase.from("evaluation_reports").select("id, submission_id, report, created_at").in("submission_id", submissionIds).order("created_at", { ascending: false }) : { data: [] };
  // The AI grader's latest view of each submission, shown apart from faculty feedback and labelled as not official.
  const { data: gradings } = submissionIds.length ? await supabase.from("submission_gradings").select("submission_id, ai_report, ai_status, created_at").in("submission_id", submissionIds).eq("ai_status", "complete").order("created_at", { ascending: false }) : { data: [] };
  const aiOf = new Map<string, AiFeedback>();
  for (const row of gradings ?? []) {
    const report = row.ai_report as { strengths?: string[]; issues?: string[]; missingRequirements?: string[]; taskMatch?: string } | null;
    if (!report || report.taskMatch === "no" || aiOf.has(row.submission_id)) continue;
    aiOf.set(row.submission_id, { strengths: (report.strengths ?? []).map(String), issues: [...(report.issues ?? []), ...(report.missingRequirements ?? [])].map(String) });
  }
  const latestReport = new Map<string, unknown>();
  for (const report of reports ?? []) if (!latestReport.has(report.submission_id)) latestReport.set(report.submission_id, report.report);
  return (submissions ?? []).map((item) => {
    const assessment = assessmentById.get(item.assessment_id);
    const stored = latestReport.get(item.id) as Record<string, unknown> | undefined;
    const evaluation = stored && typeof stored === "object" ? stored : {};
    return { id: item.id, title: assessment?.title ?? "Assessment", course: assessment ? courseById.get(assessment.course_id) ?? "Course" : "Course", courseId: assessment?.course_id ?? "", assessmentId: assessment?.id ?? "", countsTowardGrade: assessment?.counts_toward_grade !== false, mark: Number(item.official_mark), feedback: item.official_feedback, source: item.official_mark_source, sourceMark: item.source_original_mark === null ? null : Number(item.source_original_mark), sourceMaximum: item.source_original_max_mark === null ? null : Number(item.source_original_max_mark), ai: aiOf.get(item.id) ?? null, evaluationSummary: isEvaluationSummaryData(evaluation.summary) ? evaluation.summary : null, sourceReferences: getSummaryReferences(evaluation.sourceReferences) };
  });
}

// Nexus notifications and announcements that carry links, newest first.
async function loadMessages(client: SupabaseClient) {
  const { data } = await client.from("lms_messages").select("id, kind, title, course, posted_at, links").order("posted_at", { ascending: false, nullsFirst: false }).limit(40);
  return ((data ?? []) as { id: string; kind: string; title: string; course: string; posted_at: string | null; links: MessageLink[] }[]).filter((row) => row.links.length).slice(0, 12);
}

// Term report cards, newest term first.
async function loadReportCards(client: SupabaseClient): Promise<ReportCardRow[]> {
  const { data } = await client.from("lms_report_cards").select("term, program, overall_grade, gpa, cgpa, credits_earned, credits_attempted, attendance_pct, courses, fetched_at, breakdown, out_class, breakdown_generated_on, breakdown_imported_at").order("term", { ascending: false });
  return (data ?? []) as ReportCardRow[];
}
