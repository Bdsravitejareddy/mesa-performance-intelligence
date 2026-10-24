import { AppShell } from "@/components/app-shell";
import { QuizToolImport } from "@/components/quiz-tool-import";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { summariseQuizTool, type QuizToolRow } from "@/lib/imports/quiz-tool";

export const dynamic = "force-dynamic";

// Member-approved, read-only capture of Cohort 4 Quiz Tool results (see AGENTS.md). Summed here on their own;
// never part of official marks, averages or standing.
export default async function QuizToolPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const rows = hasSupabaseConfig() && !demoMode ? ((await (await createClient()).from("quiz_tool_results").select("course, term, session, correct, total, shown, missed, note, captured_at").order("course").order("session")).data ?? []) as (QuizToolRow & { note: string; captured_at: string })[] : [];
  const summary = summariseQuizTool(rows);
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Separate source</div><h1>Cohort 4 Quiz Tool</h1><p className="page-subtitle">In-class quiz results, read from your “My scores” page. Summed here on their own — not part of your official marks, averages or standing.</p></div></div>
    <section className="content-panel">
      <h2>Total</h2>
      {summary.total ? <>
        <p className="quiz-tool-total"><strong>{summary.correct} / {summary.total}</strong> correct ({summary.percent}%) across {summary.sessions} session{summary.sessions === 1 ? "" : "s"}</p>
        <table className="criteria-table"><thead><tr><th>Course</th><th>Correct</th><th>Sessions</th></tr></thead><tbody>{summary.courses.map((course) => <tr key={course.course}><td>{course.course}</td><td>{course.correct} / {course.total} ({course.percent}%)</td><td>{course.sessions}</td></tr>)}</tbody></table>
      </> : <p className="empty-hint">No Quiz Tool sessions recorded yet.</p>}
      <p className="scope-note">Counts are distinct questions. Where the tool lists a question twice, its own figure is kept beside the session.</p>
    </section>
    {rows.length > 0 && <section className="content-panel">
      <h2>Sessions</h2>
      {rows.map((row) => <details key={`${row.course}-${row.term}-${row.session}`} className="quiz-tool-session">
        <summary><strong>{row.course}{row.term ? ` · ${row.term}` : ""} · {row.session}</strong> — {row.correct} / {row.total}{row.shown ? ` (tool shows ${row.shown})` : ""}</summary>
        {row.missed.length ? <ul>{row.missed.map((item) => <li key={item.question}>{item.question} <small>You answered {item.yourAnswer || "—"}; correct: {item.correctAnswer || "—"}</small></li>)}</ul> : <p className="scope-note">No missed questions recorded.</p>}
        {row.note && <p className="scope-note">{row.note}</p>}
        <p className="scope-note">Read {new Date(row.captured_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.</p>
      </details>)}
    </section>}
    {!demoMode && <QuizToolImport />}
  </div></AppShell>;
}
