import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { FeedbackAddressed } from "@/components/feedback-addressed";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { findConflicts, loadPoints, rebuildFeedbackItems, type StoredPoint } from "@/lib/feedback/repository";

export const dynamic = "force-dynamic";
const SOURCE: Record<StoredPoint["source"], string> = { lms: "Official LMS feedback", mesa_feedback_page: "Mesa Feedback page", ai_grader: "AI grader (not official)" };

// Every piece of feedback you received, by course: what faculty asked you to work on beside what the AI grader
// flagged (not official), then what went well. Conflicting advice is shown side by side rather than averaged;
// faculty feedback is the official view where it and the AI grader disagree.
export default async function FeedbackPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const supabase = hasSupabaseConfig() && !demoMode ? await createClient() : null;
  const points = supabase ? await loadPoints(supabase).catch(() => []) : [];
  // A page's after() cannot read cookies, so it reuses the render-time client to bring the repository up to date.
  if (supabase) after(async () => { await rebuildFeedbackItems(supabase).catch(() => undefined); });
  const conflicts = findConflicts(points);
  const isOpen = (point: StoredPoint) => point.polarity === "improve" && !point.addressedAt;
  const open = points.filter(isOpen);
  const courses = [...new Set(points.map((point) => point.courseTitle || "Other"))].map((title) => {
    const mine = points.filter((point) => (point.courseTitle || "Other") === title);
    return { title, faculty: mine.filter((point) => point.authority === "faculty" && point.polarity === "improve"), ai: mine.filter((point) => point.authority === "ai" && point.polarity === "improve"), strengths: mine.filter((point) => point.polarity === "strength"), notes: mine.filter((point) => point.polarity === "note") };
  }).sort((a, b) => [...b.faculty, ...b.ai].filter(isOpen).length - [...a.faculty, ...a.ai].filter(isOpen).length || a.title.localeCompare(b.title));
  const order = (list: StoredPoint[]) => [...list].sort((a, b) => Number(Boolean(a.addressedAt)) - Number(Boolean(b.addressedAt)) || a.assessmentTitle.localeCompare(b.assessmentTitle));
  return <AppShell demoMode={demoMode}><div className="section-page feedback-repo">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Feedback</div><h1>Feedback by course</h1><p className="page-subtitle">For each course: what faculty asked you to work on, what the AI grader flagged (not official), and what went well. Updated whenever new feedback arrives.</p></div></div>
    {!points.length ? <p className="empty-hint">No feedback yet. It appears here as faculty feedback is synced and work is graded.</p> : <>
      <p className="scope-note">{open.length} things still to work on across {courses.filter((course) => [...course.faculty, ...course.ai].some(isOpen)).length} courses · {points.filter((point) => point.authority === "faculty").length} faculty points, {points.filter((point) => point.authority === "ai").length} from the AI grader.</p>
      {courses.map((course) => {
        const openCount = (list: StoredPoint[]) => list.filter(isOpen).length;
        return <details className="content-panel feedback-course" key={course.title} open={openCount(course.faculty) + openCount(course.ai) > 0}>
          <summary><strong>{course.title.replace(/\s+with\s+.*$/i, "")}</strong><span>{openCount(course.faculty)} from faculty · {openCount(course.ai)} from AI · {course.strengths.length} went well</span></summary>
          <div className="feedback-columns">
            <section className="feedback-list feedback-list-improve"><h4>To work on <span>Faculty · official</span></h4>
              {course.faculty.length ? <ul>{order(course.faculty).map((point) => <FeedbackRow key={point.id} point={point} />)}</ul> : <p className="scope-note">Nothing flagged by faculty.</p>}</section>
            <section className="feedback-list feedback-list-ai"><h4>To work on <span>AI grader · not official</span></h4>
              {course.ai.length ? <ul>{order(course.ai).map((point) => <FeedbackRow key={point.id} point={point} />)}</ul> : <p className="scope-note">No AI-graded work in this course yet.</p>}</section>
          </div>
          {(course.strengths.length > 0 || course.notes.length > 0) && <details className="feedback-original"><summary>{course.strengths.length} went well{course.notes.length ? ` · ${course.notes.length} other note${course.notes.length === 1 ? "" : "s"}` : ""}</summary>
            <ul>{[...course.strengths, ...course.notes].map((point) => <li key={point.id}>{point.text} <small>{point.authority === "ai" ? "AI grader" : "Faculty"} · {point.assessmentTitle}</small></li>)}</ul></details>}
        </details>;
      })}
      {conflicts.length > 0 && <details className="content-panel feedback-conflicts"><summary><strong>Advice that pulls in different directions ({conflicts.length})</strong></summary>
        {conflicts.slice(0, 12).map((conflict, index) => <div className="feedback-conflict" key={index}><p><strong>{conflict.summary}</strong></p><ul>{conflict.points.map((point) => <li key={point.key}><small>{SOURCE[point.source]} · {point.assessmentTitle || point.courseTitle}</small> “{point.text}”</li>)}</ul></div>)}
      </details>}
    </>}
  </div></AppShell>;
}

function FeedbackRow({ point }: { point: StoredPoint }) {
  return <li className={point.addressedAt ? "is-addressed" : ""}>
    {point.text}
    <small>{point.assessmentTitle}{point.source === "mesa_feedback_page" ? " · Mesa Feedback page" : ""}{point.givenOn ? ` · ${new Date(point.givenOn).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</small>
    <FeedbackAddressed id={point.id} addressed={Boolean(point.addressedAt)} />
  </li>;
}
