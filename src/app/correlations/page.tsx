import { AppShell } from "@/components/app-shell";
import { demoData } from "@/lib/demo-data";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CorrelationsPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const groups = demoMode ? demoData.correlations.map((item) => ({ label: item.label, average: item.score, count: item.count })) : await loadFormatGroups();
  return <AppShell demoMode><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> PERFORMANCE PATTERNS</div><h1>Correlations</h1><p className="page-subtitle">Review descriptive patterns across marks, assessment formats, and topic evidence.</p></div></div><section className="content-panel"><h2>{demoMode ? "Illustrative competency signals" : "Average official mark by assessment format"}</h2>{groups.length ? <div className="correlation-bars">{groups.map((group) => <div className="correlation-row" key={group.label}><span className="correlation-label">{group.label}</span><span className="correlation-track"><i style={{ width: `${Math.max(0, Math.min(group.average, 100))}%` }} /></span><span className="correlation-value">{Math.round(group.average)}/100 · n={group.count}</span></div>)}</div> : <div className="empty-copy"><p>There is not enough linked evidence yet to compare groups. Add marks and link assessments to course topics first.</p></div>}</section><div className="info-callout">These are descriptive summaries, not evidence that course coverage caused a mark change. Sample size, missing submissions, grading schemes, and assessment weights must be considered before interpreting patterns.</div>{demoMode && <p className="scope-note">Illustrative preview values are synthetic and are not correlations calculated from LMS records.</p>}</div></AppShell>;
}

async function loadFormatGroups() {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const [{ data: submissions, error }, { data: assessments }] = await Promise.all([
    supabase.from("submissions").select("assessment_id, official_mark").not("official_mark", "is", null),
    supabase.from("assessments").select("id, assessment_format"),
  ]);
  if (error) throw new Error("Could not load mark summaries.");
  const formats = new Map((assessments ?? []).map((item) => [item.id, item.assessment_format]));
  const values = new Map<string, number[]>();
  for (const submission of submissions ?? []) {
    const format = formats.get(submission.assessment_id) ?? "Unknown format";
    values.set(format, [...(values.get(format) ?? []), Number(submission.official_mark)]);
  }
  return [...values].map(([label, marks]) => ({ label, average: marks.reduce((sum, value) => sum + value, 0) / marks.length, count: marks.length }));
}
