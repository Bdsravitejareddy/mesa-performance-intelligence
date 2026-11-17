import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { FeedbackAddressed } from "@/components/feedback-addressed";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { findConflicts, loadPoints, rebuildFeedbackItems, type StoredPoint } from "@/lib/feedback/repository";
import { groupPoints, plain, pointsInTerm, rankGroups, recurringThemes, type FeedbackGroup } from "@/lib/feedback/themes";
import { selectedTerm } from "@/lib/term";

export const dynamic = "force-dynamic";
const SOURCE: Record<StoredPoint["source"], string> = { lms: "Faculty · Nexus", mesa_feedback_page: "Faculty · Mesa Feedback page", ai_grader: "AI grader · not official" };
const SHOWN = 5;
const short = (title: string) => title.replace(/\s+with\s+.*$/i, "");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// Every piece of feedback you received: first the few themes that keep coming back, then each course with what
// faculty asked you to work on beside what only the AI grader flagged (not official), then what went well. The same
// comment from two sources is one row; conflicting advice is shown side by side rather than averaged, and faculty
// feedback is the official view where it and the AI grader disagree.
export default async function FeedbackPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const supabase = hasSupabaseConfig() && !demoMode ? await createClient() : null;
  const term = await selectedTerm();
  const [all, courseRows] = supabase ? await Promise.all([loadPoints(supabase).catch(() => []), supabase.from("courses").select("id, term").then((result) => result.data ?? [], () => [])]) : [[], []];
  // A page's after() cannot read cookies, so it reuses the render-time client to bring the repository up to date.
  if (supabase) after(async () => { await rebuildFeedbackItems(supabase).catch(() => undefined); });
  const points = pointsInTerm(all, new Map(courseRows.map((row) => [row.id as string, row.term as string | null])), term);
  const conflicts = findConflicts(points);
  const courses = [...new Set(points.map((point) => point.courseTitle || "Other"))].map((title) => {
    const mine = points.filter((point) => (point.courseTitle || "Other") === title);
    // One row per distinct comment: a faculty comment the AI grader repeated stays with faculty, labelled as both.
    const improve = rankGroups(groupPoints(mine.filter((point) => point.polarity === "improve")));
    return { title, faculty: improve.filter((group) => group.faculty), ai: improve.filter((group) => !group.faculty), strengths: groupPoints(mine.filter((point) => point.polarity === "strength")), notes: groupPoints(mine.filter((point) => point.polarity === "note")) };
  }).sort((a, b) => [...b.faculty, ...b.ai].filter((group) => group.open).length - [...a.faculty, ...a.ai].filter((group) => group.open).length || a.title.localeCompare(b.title));
  const rows = courses.flatMap((course) => [...course.faculty, ...course.ai].map((group) => ({ ...group, course: short(course.title) })));
  const open = rows.filter((group) => group.open);
  const themes = recurringThemes(rows);
  const scope = term === "all" ? "" : ` in ${term}`;
  return <AppShell demoMode={demoMode}><div className="section-page feedback-repo">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Feedback</div><h1>Feedback by course</h1><p className="page-subtitle">The themes that keep coming back, then each course: what faculty asked you to work on, what only the AI grader flagged (not official), and what went well.{term === "all" ? "" : ` Showing ${term} courses only.`}</p></div></div>
    {!points.length ? <p className="empty-hint">{term === "all" ? "No feedback yet. It appears here as faculty feedback is synced and work is graded." : `No feedback for ${term} courses yet. Choose “All” in the header to see every term.`}</p> : <>
      <p className="scope-note">{plural(open.length, "thing")} still to work on{scope} across {plural(courses.filter((course) => [...course.faculty, ...course.ai].some((group) => group.open)).length, "course")}: {open.filter((group) => group.faculty).length} raised by faculty, {open.filter((group) => !group.faculty).length} raised only by the AI grader (not official). The same comment from two places is counted once{rows.length > open.length ? `; ${rows.length - open.length} more already marked addressed` : ""}.</p>
      {themes.length > 0 && <section className="content-panel feedback-themes" aria-label="Recurring themes">
        <h2>What keeps coming up</h2>
        <p className="scope-note">Comments that resemble each other, grouped across all your courses{scope}. Read these first: fixing one theme fixes many points at once.</p>
        <ol>{themes.map((theme) => <li key={theme.id} className="feedback-theme-card">
          <div className="feedback-theme-head"><strong>{theme.name}</strong><span className="feedback-theme-count">{plural(theme.count, "point")}</span></div>
          <small>{theme.faculty} from faculty · {theme.aiOnly} from the AI grader only · {theme.open} still open · {theme.courses.join(", ")}</small>
          {theme.quotes.map((quote) => <blockquote key={quote.text} className={quote.who === "ai" ? "is-ai" : undefined}>“{plain(quote.text)}”<small>{quote.who === "faculty" ? "Faculty" : "AI grader · not official"} · {quote.where.replace(/ · AI grader · not official$/, "")}</small></blockquote>)}
        </li>)}</ol>
      </section>}
      {courses.map((course) => {
        const openCount = (list: FeedbackGroup[]) => list.filter((group) => group.open).length;
        return <details className="content-panel feedback-course" key={course.title} open={openCount(course.faculty) + openCount(course.ai) > 0}>
          <summary><strong>{short(course.title)}</strong><span>{openCount(course.faculty)} from faculty · {openCount(course.ai)} from the AI grader only · {course.strengths.length} went well</span></summary>
          <div className="feedback-columns">
            <section className="feedback-list feedback-list-improve"><h4>To work on <span>Faculty · official</span></h4>
              {course.faculty.length ? <CappedList groups={course.faculty} /> : <p className="scope-note">Nothing flagged by faculty.</p>}</section>
            <section className="feedback-list feedback-list-ai"><h4>To work on <span>AI grader · not official</span></h4>
              {course.ai.length ? <CappedList groups={course.ai} /> : <p className="scope-note">{course.faculty.some((group) => group.ai) ? "Everything the AI grader flagged here, faculty flagged too." : "No AI-graded work in this course yet."}</p>}</section>
          </div>
          {(course.strengths.length > 0 || course.notes.length > 0) && <details className="feedback-original"><summary>{course.strengths.length} went well{course.notes.length ? ` · ${plural(course.notes.length, "other note")}` : ""}</summary>
            <ul>{[...course.strengths, ...course.notes].map((group) => <li key={group.key}>{plain(group.text)} <small>{group.faculty ? "Faculty" : "AI grader · not official"} · {group.where.join(" + ")}</small></li>)}</ul></details>}
        </details>;
      })}
      {conflicts.length > 0 && <details className="content-panel feedback-conflicts"><summary><strong>Advice that pulls in different directions ({conflicts.length})</strong></summary>
        {conflicts.slice(0, 12).map((conflict, index) => <div className="feedback-conflict" key={index}><p><strong>{conflict.summary}</strong></p><ul>{conflict.points.map((point) => <li key={point.key}><small>{SOURCE[point.source]} · {point.assessmentTitle || point.courseTitle}</small> “{plain(point.text)}”</li>)}</ul></div>)}
      </details>}
    </>}
  </div></AppShell>;
}

// The most useful few rows, the rest one click away.
function CappedList({ groups }: { groups: FeedbackGroup[] }) {
  return <>
    <ul>{groups.slice(0, SHOWN).map((group) => <FeedbackRow key={group.key} group={group} />)}</ul>
    {groups.length > SHOWN && <details className="feedback-more"><summary>Show all {groups.length}</summary><ul>{groups.slice(SHOWN).map((group) => <FeedbackRow key={group.key} group={group} />)}</ul></details>}
  </>;
}

function FeedbackRow({ group }: { group: FeedbackGroup }) {
  const date = group.latest ? ` · ${new Date(group.latest).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "";
  return <li className={group.open ? "" : "is-addressed"}>
    {plain(group.text)}
    <small>{group.where.join(" + ")}{date}</small>
    {group.faculty && group.ai && <small className="feedback-also">The AI grader flagged this too</small>}
    <FeedbackAddressed ids={group.points.map((point) => point.id)} addressed={!group.open} />
  </li>;
}
