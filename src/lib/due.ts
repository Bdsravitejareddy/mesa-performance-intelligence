// What is due, from Nexus deadlines. Days are read in Mesa's time zone (India), so "today" means the Indian date.
export const DUE_ZONE = "Asia/Kolkata";
export type DueKind = "exam" | "quiz" | "assignment" | "session";
export type DueItem = { id: string; title: string; course: string; dueAt: string | null; submitted: boolean; kind: DueKind; fromMessage?: boolean; allDay?: boolean };
export type DueGroups = { overdue: DueItem[]; today: DueItem[]; thisWeek: DueItem[]; later: DueItem[]; unscheduled: DueItem[] };

const EXAM = /\b(mid[- ]?term|end[- ]?term|final|exam|examination)\b/i;
const QUIZ = /\b(quiz|test|assessment form|viva)\b/i;

export function kindOf(title: string): DueKind {
  if (EXAM.test(title)) return "exam";
  if (QUIZ.test(title)) return "quiz";
  return "assignment";
}

// The calendar day of an instant in Mesa's zone, as YYYY-MM-DD.
export function dayOf(instant: Date | string, zone = DUE_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

// Overdue and today are unsubmitted items only; "this week" is the next seven days after today.
export function groupDue(items: DueItem[], now: Date = new Date(), zone = DUE_ZONE): DueGroups {
  const groups: DueGroups = { overdue: [], today: [], thisWeek: [], later: [], unscheduled: [] };
  const today = dayNumber(dayOf(now, zone));
  const byDue = (a: DueItem, b: DueItem) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
  for (const item of items) {
    if (item.submitted) continue;
    if (!item.dueAt) { groups.unscheduled.push(item); continue; }
    const days = dayNumber(dayOf(item.dueAt, zone)) - today;
    if (days < 0) groups.overdue.push(item);
    else if (days === 0) groups.today.push(item);
    else if (days <= 7) groups.thisWeek.push(item);
    else groups.later.push(item);
  }
  for (const key of ["overdue", "today", "thisWeek", "later"] as const) groups[key].sort(byDue);
  groups.unscheduled.sort((a, b) => a.title.localeCompare(b.title));
  return groups;
}

// Submitted when Nexus has a submission time, a status that says so, or a released mark.
// "not_submitted" contains "submit", so a negative status is checked first: it never counts as submitted.
export function isSubmitted(row: { submitted_at?: string | null; lms_submission_status?: string | null; official_mark?: number | string | null }): boolean {
  const status = String(row.lms_submission_status ?? "");
  if (/\b(not|un)[\s_-]?submitted\b|missing|pending|draft/i.test(status) && !row.submitted_at && (row.official_mark === null || row.official_mark === undefined)) return false;
  return Boolean(row.submitted_at) || /submit|graded|complete|late/i.test(status) || (row.official_mark !== null && row.official_mark !== undefined);
}
