import { AppShell } from "@/components/app-shell";
import { demoData } from "@/lib/demo-data";
import { formatOfficialMark } from "@/lib/scoring";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { LmsSyncAction } from "@/components/lms-sync-action";

export const dynamic = "force-dynamic";

export default async function MarksPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const items = demoMode ? demoData.assessments.map((item) => ({ id: item.id, title: item.title, course: item.course, mark: item.mark, feedback: "Illustrative evaluator note: connect the conclusion to the evidence and state key assumptions." })) : await loadMarks();
  const lastSync = demoMode ? null : await loadLastSync();
  return <AppShell demoMode={demoMode}><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> OFFICIAL RESULTS AND FEEDBACK</div><h1>Marks & feedback</h1><p className="page-subtitle">Official scores remain on their original 0–100 scale. AI comparisons require matching criterion evidence.</p></div>{!demoMode && <LmsSyncAction />}</div>
    {!demoMode && <div className="info-callout" role="status">{lastSync ? `Last LMS sync: ${lastSync.status} · ${new Date(lastSync.finished_at ?? lastSync.started_at).toLocaleString()} · ${lastSync.message}` : "LMS sync has not run yet. Use Sync Mesa LMS now to test the connection."}</div>}
    <section className="content-panel"><h2>Recorded marks <span className="panel-count">{items.length}</span></h2>{items.length ? <div className="marks-table">{items.map((item) => <article className="mark-feedback-row" key={item.id}><div><strong>{item.title}</strong><small>{item.course}{"source" in item && item.source ? ` · ${item.source}` : ""}</small></div><strong className="mark-pill">{formatOfficialMark(item.mark)}</strong><p>{item.feedback || "No official feedback recorded."}</p></article>)}</div> : <div className="empty-copy"><p>No official marks have been entered or imported. Use the course assessment record to add marks and evaluator feedback.</p></div>}</section>
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
    supabase.from("submissions").select("id, assessment_id, official_mark, official_feedback, official_mark_source").not("official_mark", "is", null).order("submitted_at", { ascending: false }),
    supabase.from("assessments").select("id, course_id, title"),
    supabase.from("courses").select("id, title"),
  ]);
  if (error) throw new Error("Could not load marks.");
  const assessmentById = new Map((assessments ?? []).map((item) => [item.id, item]));
  const courseById = new Map((courses ?? []).map((item) => [item.id, item.title]));
  return (submissions ?? []).map((item) => { const assessment = assessmentById.get(item.assessment_id); return { id: item.id, title: assessment?.title ?? "Assessment", course: assessment ? courseById.get(assessment.course_id) ?? "Course" : "Course", mark: Number(item.official_mark), feedback: item.official_feedback, source: item.official_mark_source }; });
}
