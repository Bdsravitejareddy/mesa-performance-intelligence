import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CalendarEventForm, RemoveCalendarEvent } from "@/components/calendar-event-form";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { DUE_ZONE, isSubmitted } from "@/lib/due";
import { buildMonth, deadlineEntries, messageEntries, monthOf, shiftMonth, type CalendarEntry, type EventKind } from "@/lib/calendar";
import { datedEvents, type MessageRow } from "@/lib/message-dates";

export const dynamic = "force-dynamic";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_LABEL: Record<string, string> = { exam: "Exam", quiz: "Quiz", assignment: "Assignment", session: "Session", hackathon: "Hackathon", competition: "Competition", interview: "Interview", deadline: "Deadline", event: "Event" };
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: DUE_ZONE, hour: "numeric", minute: "2-digit" });
const monthTitle = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });

// A month of everything with a date: Nexus deadlines (assignments, quizzes, exams) and events added here
// (hackathons, competitions, interviews). Submitted Nexus work stays on the calendar, struck through.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const month = monthOf((await searchParams).month);
  const supabase = hasSupabaseConfig() && !demoMode ? await createClient() : null;
  const [assessments, courses, submissions, events, messages] = supabase ? await Promise.all([
    supabase.from("assessments").select("id, title, course_id, due_at").not("due_at", "is", null),
    supabase.from("courses").select("id, title"),
    supabase.from("submissions").select("assessment_id, submitted_at, official_mark, lms_submission_status"),
    supabase.from("calendar_events").select("id, title, kind, starts_at, ends_at, note, link, source").order("starts_at"),
    supabase.from("lms_messages").select("id, kind, title, body, course, posted_at").order("posted_at", { ascending: false, nullsFirst: false }).limit(300),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const courseTitle = new Map((courses.data ?? []).map((row) => [row.id as string, row.title as string]));
  const submitted = new Set((submissions.data ?? []).filter((row) => isSubmitted(row)).map((row) => row.assessment_id as string));
  const nexus = deadlineEntries((assessments.data ?? []).map((row) => ({ id: row.id as string, title: row.title as string, course: (courseTitle.get(row.course_id as string) ?? "").replace(/\s+with\s+.*$/i, ""), dueAt: row.due_at as string | null, submitted: submitted.has(row.id as string) })));
  const entries: CalendarEntry[] = [
    ...nexus,
    ...messageEntries(datedEvents((messages.data ?? []) as MessageRow[]), nexus),
    ...(events.data ?? []).map((row) => ({ id: row.id as string, title: row.title as string, at: row.starts_at as string, endsAt: row.ends_at as string | null, detail: row.note as string, source: row.source as "member" | "email", kind: row.kind as EventKind, done: false, link: row.link as string | null })),
  ];
  const weeks = buildMonth(month, entries);
  const deadlines = (assessments.data ?? []).length;
  return <AppShell demoMode={demoMode}><div className="section-page calendar-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Deadlines and events</div><h1>Calendar</h1><p className="page-subtitle">Nexus assignments, plus deadlines, exams and sessions announced in Nexus notifications, with the hackathons and events you add. India time.</p></div></div>
    <nav className="calendar-nav" aria-label="Month"><Link className="button" href={`/calendar?month=${shiftMonth(month, -1)}`}>← {monthTitle(shiftMonth(month, -1))}</Link><h2>{monthTitle(month)}</h2><Link className="button" href={`/calendar?month=${shiftMonth(month, 1)}`}>{monthTitle(shiftMonth(month, 1))} →</Link></nav>
    {deadlines === 0 && !(messages.data ?? []).length && <p className="scope-note">No Nexus deadlines have been read yet. They are read at the daily sync; until then only events you add appear.</p>}
    <div className="calendar-grid" role="grid">
      {WEEKDAYS.map((day) => <div key={day} className="calendar-weekday" role="columnheader">{day}</div>)}
      {weeks.flat().map((day) => <div key={day.day} role="gridcell" className={`calendar-day${day.inMonth ? "" : " calendar-outside"}${day.isToday ? " calendar-today" : ""}`}>
        <span className="calendar-date">{Number(day.day.slice(8))}</span>
        <ul>{day.entries.map((entry) => <li key={`${entry.id}:${day.day}`} className={`calendar-entry calendar-${entry.kind}${entry.done ? " calendar-done" : ""}`}>
          <span className="calendar-kind">{KIND_LABEL[entry.kind] ?? "Event"}</span>
          {entry.link ? <a href={entry.link} target="_blank" rel="noreferrer">{entry.title}</a> : <strong>{entry.title}</strong>}
          <small>{entry.allDay ? "All day" : time(entry.at)}{entry.detail ? ` · ${entry.detail}` : ""}{entry.done ? " · submitted" : ""}{entry.source === "message" ? " · from a Nexus announcement" : ""}</small>
          {(entry.source === "member" || entry.source === "email") && <RemoveCalendarEvent id={entry.id} title={entry.title} />}
        </li>)}</ul>
      </div>)}
    </div>
    <section className="content-panel calendar-add"><h2>Add a hackathon or event</h2>
      <p className="scope-note">Nexus deadlines appear by themselves. Add what Nexus doesn’t know about: hackathons you signed up for, competitions, interviews.</p>
      <CalendarEventForm />
    </section>
  </div></AppShell>;
}
