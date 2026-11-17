// Deadlines, exams and sessions announced in Nexus notifications and announcements, which often never appear as an
// assignment ("Project submission Deadline: 19 November 2026, 11:59 PM", "the Mid-Term Written Examination will be
// conducted on Tuesday, 17th November 2026"). Read deterministically: only sentences that name a deadline, exam or
// session, and only explicit dates. Times are India time; a date without a time is all-day.

export type MessageRow = { id: string; kind: string; title: string; body: string; course: string; posted_at: string | null };
export type MessageEvent = { id: string; title: string; course: string; at: string; allDay: boolean; kind: "exam" | "deadline" | "session"; sentence: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const TIME = "(?:,?\\s*(?:at|by|till|until)?\\s*(\\d{1,2})(?:[:.](\\d{2}))?(?::\\d{2})?\\s*(am|pm)\\b)?";
// "19 November 2026, 11:59 PM", "Tuesday, 17th November", "16 Nov 2026 11:59:59 PM IST"
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b(?:,?\\s+(\\d{4}))?${TIME}`, "gi");
// "November 19, 2026 at 11:59 PM", "Nov 19"
const MONTH_FIRST = new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?${TIME}`, "gi");

const EXAM = /\b(exam|examination|mid[- ]?term|end[- ]?term|quiz|test|viva)\b/i;
const DEADLINE = /\b(deadline|due|submit|submission|save|upload|on or before|last date)\b/i;
const SESSION = /\b(pitch|presentation|session|workshop|masterclass|class|lecture|viva|interview|slot|demo)\b/i;
// A date that is being taken back is not an event: "sessions scheduled for 13th November have been cancelled",
// "This replaces the earlier C01 deadline of 15 November".
const WITHDRAWN = /\b(cancel(?:led|ed|lation)?|postponed|replaces|earlier deadline|no longer|rescheduled from)\b/i;
type Kind = MessageEvent["kind"];
const kindIn = (text: string): Kind | null => (DEADLINE.test(text) && /on or before|last date|deadline/i.test(text) ? "deadline" : EXAM.test(text) ? "exam" : DEADLINE.test(text) ? "deadline" : SESSION.test(text) ? "session" : null);

function sentencesOf(text: string): string[] {
  return text.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").split(/(?<=[.!?•])\s+|\s+•\s+|\s-\s/).map((part) => part.trim()).filter(Boolean);
}

function instant(day: number, monthIndex: number, year: number, hour: number | null, minute: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return new Date(`${year}-${pad(monthIndex + 1)}-${pad(day)}T${pad(hour ?? 12)}:${pad(minute)}:00+05:30`).toISOString();
}

export function datedEvents(messages: MessageRow[]): MessageEvent[] {
  const events: MessageEvent[] = [];
  const seen = new Set<string>();
  // Announcements carry the full text; a notification often repeats it cut short, so announcements are read first.
  const ordered = [...messages].sort((a, b) => Number(a.kind !== "announcement") - Number(b.kind !== "announcement"));
  for (const message of ordered) {
    const posted = message.posted_at ? new Date(message.posted_at) : null;
    const title = message.title.replace(/\s+/g, " ").trim();
    for (const sentence of sentencesOf(`${title}. ${message.body}`)) {
      const sentenceKind = EXAM.test(title) && /conducted|held|scheduled|on\s/i.test(sentence) ? "exam" : kindIn(sentence);
      if (!sentenceKind || WITHDRAWN.test(sentence)) continue;
      for (const pattern of [DAY_FIRST, MONTH_FIRST]) {
        pattern.lastIndex = 0;
        for (let match = pattern.exec(sentence); match; match = pattern.exec(sentence)) {
          const dayFirst = pattern === DAY_FIRST;
          const day = Number(dayFirst ? match[1] : match[2]);
          const monthIndex = MONTHS.indexOf((dayFirst ? match[2] : match[1]).slice(0, 3).toLowerCase());
          if (monthIndex < 0 || day < 1 || day > 31) continue;
          let year = match[3] ? Number(match[3]) : posted?.getUTCFullYear() ?? new Date().getUTCFullYear();
          // A date without a year that falls well before the message was posted is next year's.
          if (!match[3] && posted && Date.UTC(year, monthIndex, day) < posted.getTime() - 60 * 86_400_000) year += 1;
          const hour = match[4] ? (Number(match[4]) % 12) + (/pm/i.test(match[6] ?? "") ? 12 : 0) : null;
          const at = instant(day, monthIndex, year, hour, match[5] ? Number(match[5]) : 0);
          if (!Number.isFinite(Date.parse(at))) continue;
          // Each date is labelled by the words just before it ("Deadline to fill the form: 6th November"), then by the
          // message title, then by the sentence, so a second date in a long sentence keeps its own meaning.
          const kind = kindIn(sentence.slice(Math.max(0, match.index - 70), match.index)) ?? kindIn(title) ?? sentenceKind;
          const key = `${title.toLowerCase()}|${at.slice(0, 10)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          events.push({ id: `message:${message.id}:${at.slice(0, 10)}`, title, course: message.course, at, allDay: hour === null, kind, sentence: sentence.slice(0, 300) });
        }
      }
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}
