import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { FeedbackAddressed } from "@/components/feedback-addressed";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { THEMES, findConflicts, loadPoints, rebuildFeedbackItems, type StoredPoint } from "@/lib/feedback/repository";

export const dynamic = "force-dynamic";
const SOURCE: Record<StoredPoint["source"], string> = { lms: "Official LMS feedback", mesa_feedback_page: "Mesa Feedback page", ai_grader: "AI grader (not official)" };
const POLARITY: Record<StoredPoint["polarity"], string> = { strength: "Went well", improve: "To work on", note: "Note" };

// Every piece of feedback you received, one point per row, grouped by theme. Conflicting advice is shown side by
// side rather than averaged; faculty feedback is the official view where it and the AI grader disagree.
export default async function FeedbackPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const supabase = hasSupabaseConfig() && !demoMode ? await createClient() : null;
  const points = supabase ? await loadPoints(supabase).catch(() => []) : [];
  // A page's after() cannot read cookies, so it reuses the render-time client to bring the repository up to date.
  if (supabase) after(async () => { await rebuildFeedbackItems(supabase).catch(() => undefined); });
  const conflicts = findConflicts(points);
  const open = points.filter((point) => point.polarity === "improve" && !point.addressedAt);
  const themes = Object.entries(THEMES).map(([name, theme]) => ({ name, label: theme.label, points: points.filter((point) => point.themes.includes(name)) })).filter((group) => group.points.length)
    .sort((a, b) => b.points.filter((point) => point.polarity === "improve" && !point.addressedAt).length - a.points.filter((point) => point.polarity === "improve" && !point.addressedAt).length);
  const untagged = points.filter((point) => !point.themes.length);
  return <AppShell demoMode={demoMode}><div className="section-page feedback-repo">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Feedback</div><h1>Feedback you received</h1><p className="page-subtitle">Every point from official LMS feedback, Mesa’s Feedback page and the AI grader, one per row, grouped by what it is about. Updated whenever new feedback arrives.</p></div></div>
    {!points.length ? <p className="empty-hint">No feedback yet. It appears here as faculty feedback is synced and work is graded.</p> : <>
      <p className="scope-note">{points.length} points · {open.length} still to work on · {points.filter((point) => point.authority === "faculty").length} from faculty, {points.filter((point) => point.authority === "ai").length} from the AI grader.</p>
      {conflicts.length > 0 && <section className="content-panel feedback-conflicts"><h2>Advice that pulls in different directions ({conflicts.length})</h2>
        {conflicts.slice(0, 12).map((conflict, index) => <div className="feedback-conflict" key={index}><p><strong>{conflict.summary}</strong></p><ul>{conflict.points.map((point) => <li key={point.key}><small>{SOURCE[point.source]} · {point.assessmentTitle || point.courseTitle}</small> “{point.text}”</li>)}</ul></div>)}
      </section>}
      {themes.map((group) => <details className="content-panel feedback-theme" key={group.name} open={group.points.some((point) => point.polarity === "improve" && !point.addressedAt)}>
        <summary><strong>{group.label}</strong> <span>{group.points.filter((point) => point.polarity === "improve" && !point.addressedAt).length} to work on · {group.points.filter((point) => point.polarity === "strength").length} went well</span></summary>
        <ul>{group.points.sort((a, b) => Number(Boolean(a.addressedAt)) - Number(Boolean(b.addressedAt)) || (a.authority === "faculty" ? -1 : 1)).map((point) => <FeedbackRow key={point.id} point={point} />)}</ul>
      </details>)}
      {untagged.length > 0 && <details className="content-panel feedback-theme"><summary><strong>Other feedback</strong> <span>{untagged.length}</span></summary><ul>{untagged.map((point) => <FeedbackRow key={point.id} point={point} />)}</ul></details>}
    </>}
  </div></AppShell>;
}

function FeedbackRow({ point }: { point: StoredPoint }) {
  return <li className={`feedback-point feedback-${point.polarity}${point.addressedAt ? " is-addressed" : ""}`}>
    <span className="feedback-kind">{POLARITY[point.polarity]}</span>
    <p>{point.text}</p>
    <small>{SOURCE[point.source]} · {point.assessmentTitle}{point.courseTitle ? ` (${point.courseTitle.replace(/\s+with\s+.*$/i, "")})` : ""}{point.givenOn ? ` · ${new Date(point.givenOn).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</small>
    {point.polarity === "improve" && <FeedbackAddressed id={point.id} addressed={Boolean(point.addressedAt)} />}
  </li>;
}
