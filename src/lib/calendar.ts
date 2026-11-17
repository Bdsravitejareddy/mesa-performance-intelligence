import { DUE_ZONE, dayOf, kindOf, type DueKind } from "./due";
import { titleScore } from "./materials/submission-matching";
import type { MessageEvent } from "./message-dates";

// One calendar of what is due and what is on: Nexus deadlines (assignments, quizzes, exams) and events a member
// added (hackathons, competitions, interviews). Days are India dates, as on the Due page.
export type EventKind = "hackathon" | "competition" | "exam" | "interview" | "deadline" | "event";
export const EVENT_KINDS: EventKind[] = ["hackathon", "competition", "exam", "interview", "deadline", "event"];
export type CalendarEntry = {
  id: string; title: string; at: string; endsAt: string | null; detail: string;
  source: "nexus" | "message" | "member" | "email"; kind: DueKind | EventKind | "session"; done: boolean; link: string | null; allDay?: boolean;
};
export type CalendarDay = { day: string; inMonth: boolean; isToday: boolean; entries: CalendarEntry[] };

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

// The month to show: "YYYY-MM" from the address, else the current India month.
export function monthOf(value: string | null | undefined, now: Date = new Date()): string {
  return value && MONTH.test(value) ? value : dayOf(now, DUE_ZONE).slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// Whole weeks (Monday first) covering the month, each day holding the entries that fall on it. An event that spans
// several days appears on each of them.
export function buildMonth(month: string, entries: CalendarEntry[], now: Date = new Date()): CalendarDay[][] {
  const [year, index] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, index - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const today = dayOf(now, DUE_ZONE);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const from = dayOf(entry.at, DUE_ZONE);
    const to = entry.endsAt ? dayOf(entry.endsAt, DUE_ZONE) : from;
    for (let cursor = new Date(`${from}T00:00:00Z`), guard = 0; isoDay(cursor) <= to && guard < 62; cursor.setUTCDate(cursor.getUTCDate() + 1), guard += 1) {
      byDay.set(isoDay(cursor), [...(byDay.get(isoDay(cursor)) ?? []), entry]);
    }
  }
  const weeks: CalendarDay[][] = [];
  for (const cursor = new Date(start); weeks.length < 6; ) {
    const week: CalendarDay[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const day = isoDay(cursor);
      week.push({ day, inMonth: day.slice(0, 7) === month, isToday: day === today, entries: (byDay.get(day) ?? []).sort((a, b) => a.at.localeCompare(b.at)) });
    }
    weeks.push(week);
    if (cursor.getUTCMonth() !== index - 1) break;
  }
  return weeks;
}

// Nexus assessments with a deadline become calendar entries; work already submitted stays on the calendar, marked done.
export function deadlineEntries(rows: { id: string; title: string; course: string; dueAt: string | null; submitted: boolean }[]): CalendarEntry[] {
  return rows.filter((row) => row.dueAt).map((row) => ({ id: `nexus:${row.id}`, title: row.title, at: row.dueAt!, endsAt: null, detail: row.course, source: "nexus", kind: kindOf(row.title), done: row.submitted, link: null }));
}

// Deadlines, exams and sessions named in Nexus notifications and announcements. One that repeats an assignment
// already on the same day (by its distinctive words) is left out, so nothing appears twice.
export function messageEntries(events: MessageEvent[], deadlines: CalendarEntry[]): CalendarEntry[] {
  return events.filter((event) => !deadlines.some((entry) => dayOf(entry.at, DUE_ZONE) === dayOf(event.at, DUE_ZONE) && titleScore(event.title, entry.title) >= 0.5))
    .map((event) => ({ id: event.id, title: event.title, at: event.at, endsAt: null, detail: event.course.replace(/\s+with\s+.*$/i, ""), source: "message" as const, kind: event.kind === "deadline" ? "deadline" as const : event.kind, done: false, link: null, allDay: event.allDay }));
}
