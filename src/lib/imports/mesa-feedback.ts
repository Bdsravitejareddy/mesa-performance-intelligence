// Mesa's own Feedback page (the school's Apps Script web app): MRS marks by section and written faculty feedback,
// read through the member's own signed-in browser and imported as official results at the member's request
// (2026-11-05). Each MRS section is an assessment of its course; its score is kept as given out of its maximum
// and converted to the 0–100 scale like LMS marks. MRS totals are not stored: they are the sum of the sections,
// so storing both would count the same marks twice.
export const MESA_FEEDBACK_SOURCE = "Mesa Feedback page";

export type FeedbackCriterion = { label: string; score: number; max: number };
export type FeedbackLine = { label: string; status: "right" | "partly" | "to_fix" | "note"; detail: string };
export type FeedbackSection = { title: string; lines: FeedbackLine[]; wentWell: string[]; improve: string[]; nextSteps: string[]; notes: string[] };
export type FeedbackAssessment = { course: string; title: string; term: string; score: number; max: number; criteria: FeedbackCriterion[]; sections: FeedbackSection[] };

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const list = (value: unknown, max = 600) => (Array.isArray(value) ? value : []).map((item) => text(item, max)).filter(Boolean).slice(0, 40);
const STATUS = new Set(["right", "partly", "to_fix", "note"]);
const validScore = (score: number, max: number) => Number.isFinite(score) && Number.isFinite(max) && max > 0 && score >= 0 && score <= max;

export function parseFeedbackAssessment(raw: Record<string, unknown>): FeedbackAssessment | { error: string } {
  const course = text(raw.course, 160), title = text(raw.title, 160), term = text(raw.term, 40);
  const score = Number(raw.score), max = Number(raw.max);
  if (!course || !title) return { error: "Each assessment needs its course and title." };
  if (!validScore(score, max)) return { error: `${title}: the score must be between 0 and its maximum.` };
  const criteria = (Array.isArray(raw.criteria) ? raw.criteria as Record<string, unknown>[] : []).map((item) => ({ label: text(item.label, 60), score: Number(item.score), max: Number(item.max) }));
  if (criteria.some((item) => !item.label || !validScore(item.score, item.max))) return { error: `${title}: every criterion needs a label and a score within its maximum.` };
  const sections = (Array.isArray(raw.sections) ? raw.sections as Record<string, unknown>[] : []).slice(0, 20).map((section) => ({
    title: text(section.title, 120),
    lines: (Array.isArray(section.lines) ? section.lines as Record<string, unknown>[] : []).slice(0, 40).map((line) => ({ label: text(line.label, 300), status: (STATUS.has(String(line.status)) ? line.status : "note") as FeedbackLine["status"], detail: text(line.detail, 600) })).filter((line) => line.label || line.detail),
    wentWell: list(section.wentWell), improve: list(section.improve), nextSteps: list(section.nextSteps), notes: list(section.notes),
  }));
  return { course, title, term, score, max, criteria, sections };
}

// Same conversion as LMS marks: the share of the maximum on the 0–100 scale, to two decimals.
export const toHundred = (score: number, max: number) => Math.round((score / max) * 10000) / 100;

// Course titles on the page are short ("AI and its Applications"); workspace titles may add the faculty
// ("… with Prof. …") or differ by a plural. Compared without either.
export const courseKey = (title: string) => title.toLowerCase().replace(/\s+with\s+.*$/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/s$/, "");

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
export const recordId = (item: Pick<FeedbackAssessment, "course" | "title" | "term">) => `mesa-feedback:${slug(item.term || "term")}:${slug(courseKey(item.course))}:${slug(item.title)}`;

const STATUS_LABEL: Record<FeedbackLine["status"], string> = { right: "Right", partly: "Partly", to_fix: "To fix", note: "Note" };

// The official feedback text as stored: the criterion breakdown first, one per line in "Label score/max" form so
// the criterion parser reads it, then each section's feedback as the page gives it.
export function feedbackText(item: FeedbackAssessment, readOn: string): string {
  const out: string[] = [`${MESA_FEEDBACK_SOURCE} — ${item.term ? `${item.term}, ` : ""}${item.title}: ${item.score}/${item.max} (read ${readOn}).`];
  if (item.criteria.length) out.push("", ...item.criteria.map((criterion) => `${criterion.label} ${criterion.score}/${criterion.max}`));
  for (const section of item.sections) {
    out.push("", section.title);
    for (const line of section.lines) out.push(`${STATUS_LABEL[line.status]}: ${line.label}${line.detail ? ` — ${line.detail}` : ""}`);
    if (section.wentWell.length) out.push(...section.wentWell.map((entry) => `What went well: ${entry}`));
    if (section.improve.length) out.push(...section.improve.map((entry) => `What to improve: ${entry}`));
    if (section.nextSteps.length) out.push(...section.nextSteps.map((entry) => `Next step: ${entry}`));
    if (section.notes.length) out.push(...section.notes.map((entry) => `Note: ${entry}`));
  }
  return out.join("\n").slice(0, 20000);
}
