import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { DUE_ZONE, groupDue, isSubmitted, kindOf, type DueItem } from "@/lib/due";

export const dynamic = "force-dynamic";
const KIND_LABEL = { exam: "Exam", quiz: "Quiz", assignment: "Assignment" } as const;
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: DUE_ZONE, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// What is due: overdue and today first, then this week, then later. Exams and quizzes are marked as such. Items
// with no deadline on Nexus are listed separately rather than guessed at.
export default async function DuePage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const supabase = hasSupabaseConfig() && !demoMode ? await createClient() : null;
  const [assessments, courses, submissions] = supabase ? await Promise.all([
    supabase.from("assessments").select("id, title, course_id, due_at"),
    supabase.from("courses").select("id, title"),
    supabase.from("submissions").select("assessment_id, submitted_at, official_mark, lms_submission_status"),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const courseTitle = new Map((courses.data ?? []).map((row) => [row.id as string, row.title as string]));
  const submitted = new Set((submissions.data ?? []).filter((row) => isSubmitted(row)).map((row) => row.assessment_id as string));
  const items: DueItem[] = (assessments.data ?? []).map((row) => ({
    id: row.id as string, title: row.title as string, course: (courseTitle.get(row.course_id as string) ?? "").replace(/\s+with\s+.*$/i, ""),
    dueAt: (row.due_at as string | null) ?? null, submitted: submitted.has(row.id as string), kind: kindOf(row.title as string),
  }));
  const groups = groupDue(items);
  const scheduled = items.filter((item) => item.dueAt).length;
  return <AppShell demoMode={demoMode}><div className="section-page due-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Deadlines</div><h1>Due</h1><p className="page-subtitle">Assignments, quizzes and exams with a deadline on Nexus, for India time. Submitted work is left out.</p></div></div>
    {!items.length ? <p className="empty-hint">No assessments yet. They appear after the next Nexus sync.</p> : <>
      <DueSection title="Due today" items={groups.today} empty="Nothing due today." emphasis />
      <DueSection title="Overdue and not submitted" items={groups.overdue} empty="Nothing overdue." />
      <DueSection title="Next seven days" items={groups.thisWeek} empty="Nothing else due this week." />
      <DueSection title="Later" items={groups.later} empty="Nothing scheduled after this week." />
      {groups.unscheduled.length > 0 && <section className="content-panel due-section"><h2>No deadline on Nexus <span className="panel-count">{groups.unscheduled.length}</span></h2>
        <p className="scope-note">Nexus has not given a deadline for these, so they cannot be placed in a day. Check the brief on the assessment.</p>
        <ul>{groups.unscheduled.map((item) => <li key={item.id}>{item.title}{item.course ? <small> · {item.course}</small> : null}</li>)}</ul></section>}
      {scheduled === 0 && <p className="scope-note">No deadlines have been read from Nexus yet. They are read at the next daily sync.</p>}
    </>}
  </div></AppShell>;
}

function DueSection({ title, items, empty, emphasis = false }: { title: string; items: DueItem[]; empty: string; emphasis?: boolean }) {
  return <section className={`content-panel due-section${emphasis ? " due-today" : ""}`}><h2>{title} <span className="panel-count">{items.length}</span></h2>
    {items.length ? <ul>{items.map((item) => <li key={item.id}><span className={`due-kind due-${item.kind}`}>{KIND_LABEL[item.kind]}</span><strong>{item.title}</strong><small>{item.course}{item.dueAt ? ` · ${time(item.dueAt)}` : ""}</small></li>)}</ul> : <p className="scope-note">{empty}</p>}
  </section>;
}

