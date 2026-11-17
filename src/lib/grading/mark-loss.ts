import type { BlindReport } from "@/lib/quality/engine";
import type { CodeReport } from "./code-score";
import { splitPoints } from "./compare";

// Where the marks went on an officially marked assessment. The lost marks (100 − official) are allocated to
// criteria from the faculty's own breakdown when the feedback gives one ("Market 2/5"); otherwise they are
// estimated from where the blind AI found the work weakest, and labelled as an estimate. Deterministic.
// The criteria plus any unattributed remainder always add up to the marks lost.

export type LossSource = "faculty_breakdown" | "faculty_questions" | "ai_estimate";
export type LossItem = { criterion: string; lost: number; detail: string; theme: Theme; got?: number; max?: number };
export type MarkLoss = {
  official: number; lost: number; source: LossSource;
  items: LossItem[];
  // Lost marks no criterion accounts for (e.g. a late penalty); with the items it adds up to `lost`.
  unattributed: number;
  facultyComments: string[];
  missingParts: string[];
  late: boolean;
  interpretation: string;
  aiView: string | null;
};

export type Theme = "interpretation" | "accuracy" | "market" | "structure" | "brief" | "recommendation" | "other";
const THEMES: [Theme, RegExp][] = [
  ["market", /market|competit|customer|user|segment|gtm|go-to-market|channel|acquisition|pricing|positioning/i],
  ["interpretation", /mastery|bmq|insight|interpret/i],
  ["accuracy", /calculat|accura|formula|number|quant|data type|conversion|arithmetic|lookup|function|metric|figure|dashboard|filter|count/i],
  ["interpretation", /analys|reason|rigou?r|depth|hypothes|validat|evidence|conclu|problem/i],
  ["recommendation", /recommend|decision|action|strateg|mvp|plan|solution|implement/i],
  ["structure", /structur|clarity|clear|present|format|label|communicat|layout|organis|organiz|writing/i],
  ["brief", /instruction|rule|requirement|complete|missing|brief|sheet|tab|deadline|guideline/i],
];
export const THEME_LABEL: Record<Theme, string> = {
  interpretation: "analysis and interpretation", accuracy: "accuracy and method", market: "market and customer analysis",
  structure: "structure and presentation", brief: "following the brief", recommendation: "recommendations and next steps", other: "other criteria",
};
const MEANING: Record<Theme, string> = {
  interpretation: "the work was done, but the conclusions drawn from it were judged thin or unsupported — say what the numbers mean and why, not only what they are",
  accuracy: "marks went on getting the method or figures right — check formulas, the functions the brief names, and the arithmetic",
  market: "the core problem was covered, but the view outward — market size, competitors, customers, channels — was judged incomplete",
  structure: "the content may be sound, but it was hard to follow — label answers, lead with the conclusion, keep one question per section",
  brief: "parts the brief asked for, or its ground rules, were missed — mark off each instruction before submitting",
  recommendation: "the analysis did not carry through to a concrete, justified recommendation",
  other: "losses are spread across criteria the analysis could not group",
};
const match = (text: string) => THEMES.find(([, pattern]) => pattern.test(text))?.[0];
// The criterion's own name decides its theme; the comment on it is used only when the name is uninformative.
export const themeOf = (name: string, detail = ""): Theme => match(name) ?? match(detail) ?? "other";
const round1 = (value: number) => Math.round(value * 10) / 10;

// "Problem & validation 3/5 | Customer, market & competition 2/5" → criterion scores.
export function facultyBreakdown(feedback: string): { criterion: string; got: number; max: number }[] {
  const items: { criterion: string; got: number; max: number }[] = [];
  for (const match of feedback.matchAll(/([A-Za-z][A-Za-z ,&/'()-]{2,60}?)\s*[:\-–]?\s*(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)/g)) {
    const got = Number(match[2]); const max = Number(match[3]);
    const criterion = match[1].replace(/^[\s|,;&-]+|[\s|,;:&-]+$/g, "").replace(/^(and|or)\s+/i, "");
    if (!criterion || max <= 0 || got > max || max > 100) continue;
    if (/^(total|overall|score|marks?|grade)$/i.test(criterion)) continue;
    items.push({ criterion, got, max });
  }
  return items.length >= 2 ? items : [];
}

// Question-by-question feedback under sections that carry their marks: "L2 (25 marks): Q1 — …: Correct.
// Q4 — …: You got Bleh — not quite right." Each section's loss is estimated from the share of its questions
// marked wrong (a small deduction counts a quarter); a section scored explicitly ("…: 18/25") keeps its figure.
type Section = { name: string; marks: number; lost: number; exact: boolean; detail: string };
const WRONG = /not quite right|incorrect|wrong|missing|not answered|not attempted/i;
const MINOR = /small deduction|minor deduction|partially|partly/i;
export function sectionBreakdown(feedback: string): Section[] {
  const text = feedback.replace(/\s+/g, " ");
  const headers = [...text.matchAll(/(?:FEEDBACK\s*)?\(?([A-Z][A-Za-z0-9 ]{0,40}?)\s*\((\d+(?:\.\d+)?)\s*marks?([^)]*)\)\s*:?|FEEDBACK\s*\(([^)]{3,60})\)\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)];
  const sections: Section[] = [];
  headers.forEach((header, index) => {
    const body = text.slice(header.index! + header[0].length, headers[index + 1]?.index ?? text.length).replace(/-{3,}.*$/, "").trim();
    if (header[4]) {
      const got = Number(header[5]); const max = Number(header[6]);
      const missing = body.match(/(?:missing or weak|missing)[:\s—–-]+([^.]+)/i)?.[1];
      if (max > 0 && got <= max) sections.push({ name: header[4].replace(/\b\w/g, (c) => c).trim(), marks: max, lost: max - got, exact: true, detail: missing ? `Missing: ${missing.trim()}.` : body.slice(0, 200) });
      return;
    }
    const marks = Number(header[2]);
    const note = header[3].replace(/^[\s,—–-]+/, "").trim();
    const name = `${header[1].trim()}${note ? ` (${note})` : ""}`;
    const items = body.split(/(?=\bQ\d+\s*[—–-])/).filter((item) => /^Q\d+/.test(item.trim()));
    let share = 0; const wrong: string[] = [];
    if (items.length) {
      let missed = 0;
      for (const item of items) {
        const verdict = item.slice(item.indexOf(":") + 1);
        if (WRONG.test(verdict)) { missed += 1; wrong.push(item.replace(/\s*Double-check.*$/i, "").replace(/\s*—\s*not quite right\.?/i, "").trim().slice(0, 160)); }
        else if (MINOR.test(verdict)) { missed += 0.25; wrong.push(`${item.trim().slice(0, 140)} (small deduction)`); }
      }
      share = missed / items.length;
    } else {
      const lines = body.split(/(?<=\.)\s+(?=[a-z][a-z ]+:)|;\s*/).filter((line) => line.trim());
      const bad = lines.filter((line) => WRONG.test(line));
      share = bad.length ? Math.max(0.5, bad.length / Math.max(1, lines.filter((line) => !/^reminder/i.test(line.trim())).length)) : 0;
      // The same mistake repeated across many lines is usually one rule applied wrongly everywhere.
      const repeated = bad.map((line) => line.replace(/^[^:]+:\s*/, "").trim()).reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>());
      const [common, times] = [...repeated.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
      if (times >= 3) wrong.push(`The same error in ${times} places: ${common.slice(0, 160)} — likely one rule applied wrongly throughout.`);
      else wrong.push(...bad.slice(0, 3).map((line) => line.trim().slice(0, 160)));
      const reminder = body.match(/Reminder:\s*([^]+?)(?:$|-{3,})/i)?.[1];
      if (reminder && bad.length) wrong.push(`Faculty's reminder: ${reminder.trim().slice(0, 200)}`);
    }
    sections.push({ name, marks, lost: Math.min(marks, marks * Math.min(1, share)), exact: false, detail: wrong.join(" ") });
  });
  return sections.length >= 2 ? sections : [];
}

// Shares `total` out in proportion to `weights`, in tenths, so the parts always add up to the total exactly.
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + Math.max(0, weight), 0);
  if (!sum || total <= 0) return weights.map(() => 0);
  const tenths = Math.round(total * 10);
  const raw = weights.map((weight) => (Math.max(0, weight) / sum) * tenths);
  const parts = raw.map(Math.floor);
  const order = raw.map((value, index) => [value - Math.floor(value), index] as const).sort((a, b) => b[0] - a[0]);
  for (let left = tenths - parts.reduce((acc, part) => acc + part, 0), i = 0; left > 0; left -= 1, i += 1) parts[order[i % order.length][1]] += 1;
  return parts.map((part) => part / 10);
}

// Feedback often repeats a criterion line (a summary row, then the same score beside its comment): keep the first.
const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
export function dedupeCriteria<T extends { criterion: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => { const key = nameKey(item.criterion); if (seen.has(key)) return false; seen.add(key); return true; });
}

const fmtMarks = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
const scoreOf = (item: LossItem) => (item.got !== undefined && item.max !== undefined ? ` (${fmtMarks(round1(item.got))}/${fmtMarks(round1(item.max))})` : "");
const NAMED = 3;

export function markLoss(input: { official: number | null; feedback: string; report: BlindReport | null; codeReport: CodeReport | null; late: boolean | null }): MarkLoss | null {
  const { official } = input;
  if (official === null || official >= 100) return null;
  const lost = round1(100 - official);
  const sections = dedupeCriteria(sectionBreakdown(input.feedback).map((section) => ({ ...section, criterion: section.name })));
  const breakdown = sections.length ? [] : dedupeCriteria(facultyBreakdown(input.feedback));
  // Comments are the faculty's sentences; the score line itself ("Market 2/5 | GTM 2/5") is not a comment.
  const comments = [...new Set(splitPoints(input.feedback).filter((point) => (point.match(/\d+(?:\.\d+)?\s*\/\s*\d+/g) ?? []).length < 2 && facultyBreakdown(point).length < 2))].slice(0, 6);
  let items: LossItem[] = [];
  let source: LossSource = "ai_estimate";
  let scale = "";
  if (sections.length) {
    source = "faculty_questions";
    // Exact section scores stand; estimated sections share the rest of the lost marks in proportion.
    const exact = sections.filter((section) => section.exact && section.lost > 0);
    const estimated = sections.filter((section) => !section.exact && section.lost > 0);
    const shares = apportion(Math.max(0, lost - exact.reduce((sum, section) => sum + section.lost, 0)), estimated.map((section) => section.lost));
    items = [
      ...exact.map((section) => ({ criterion: section.name, lost: round1(section.lost), max: section.marks, got: section.marks - section.lost, detail: section.detail, theme: themeOf(section.name, section.detail) })),
      ...estimated.map((section, index) => ({ criterion: section.name, lost: shares[index], max: section.marks, detail: section.detail, theme: themeOf(section.name, section.detail) })),
    ].filter((item) => item.lost > 0);
  } else if (breakdown.length) {
    source = "faculty_breakdown";
    const short = breakdown.filter((item) => item.got < item.max);
    const maxTotal = breakdown.reduce((sum, item) => sum + item.max, 0);
    // A breakdown out of 100 is on the official scale, so each criterion's shortfall is what it lost. On any other
    // total the official criteria and maxima are kept as given and the lost marks are shared in proportion.
    const onScale = Math.abs(maxTotal - 100) < 0.5;
    const shares = onScale ? short.map((item) => round1(item.max - item.got)) : apportion(lost, short.map((item) => item.max - item.got));
    if (!onScale) scale = ` The faculty's criteria add up to ${fmtMarks(round1(maxTotal))} marks, not 100, so each criterion's shortfall is shared across the ${lost} in proportion; the criterion scores are shown as given.`;
    items = short.map((item, index) => {
      const related = comments.find((comment) => item.criterion.toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 3).some((word) => comment.toLowerCase().includes(word)));
      return { criterion: item.criterion, got: item.got, max: item.max, lost: shares[index], detail: related ?? "", theme: themeOf(item.criterion, related ?? "") };
    });
  } else if (input.report?.dimensions.length) {
    const scored = dedupeCriteria(input.report.dimensions.filter((dimension) => dimension.score !== null && dimension.score < 10).map((dimension) => ({ ...dimension, criterion: dimension.name })));
    const shares = apportion(lost, scored.map((dimension) => 10 - dimension.score!));
    items = scored.map((dimension, index) => ({
      criterion: dimension.name, lost: shares[index],
      detail: [dimension.issue, dimension.improvement && `To improve: ${dimension.improvement}`].filter(Boolean).join(" "), theme: themeOf(dimension.name, dimension.issue),
    }));
  }
  items.sort((a, b) => b.lost - a.lost);
  const attributed = round1(items.reduce((sum, item) => sum + item.lost, 0));
  // What the criteria do not account for (a late penalty, an unstated adjustment) is said, not spread around.
  const unattributed = items.length ? round1(lost - attributed) : 0;
  const missingParts = (input.codeReport?.parts ?? []).filter((part) => !part.answered).map((part) => `${part.label} ${part.text}`.slice(0, 140));

  // Interpretation: every lost mark is placed — the largest criteria by their official names, the rest together.
  const basis = source === "faculty_breakdown" ? "the faculty's own criterion scores" : source === "faculty_questions" ? "the faculty's question-by-question feedback" : "where the blind AI found the work weakest (an estimate — no faculty breakdown was given)";
  const shown = items.length <= NAMED + 1 ? items.length : NAMED;
  const named = items.slice(0, shown).map((item) => `${fmtMarks(item.lost)} on ${item.criterion}${scoreOf(item)}`);
  const rest = items.slice(shown);
  if (rest.length) named.push(`${fmtMarks(round1(rest.reduce((sum, item) => sum + item.lost, 0)))} across ${rest.length} other criteri${rest.length === 1 ? "on" : "a"}`);
  if (unattributed >= 0.1) named.push(`${fmtMarks(unattributed)} that no criterion accounts for${input.late ? " (possibly the late penalty)" : ""}`);
  const listed = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}` : named[0];
  const over = unattributed <= -0.1 ? ` The criterion scores add up to ${fmtMarks(attributed)} lost, more than the ${lost} lost overall, so the official total may include an adjustment; both are shown as given.` : "";
  const interpretation = items.length
    ? `Of the ${lost} marks lost: ${listed} — going by ${basis}.${scale}${over} In short: ${MEANING[items[0].theme]}.${input.late && unattributed < 0.1 ? " It was also submitted late; any late penalty is inside the official mark." : ""}`
    : `${lost} marks were lost, but there is no faculty breakdown and no AI grade to show where.${input.late ? " It was submitted late, so part of the loss may be a late penalty." : ""}`;

  // How the blind AI's weakest criteria line up with the faculty's breakdown.
  let aiView: string | null = null;
  if (source !== "ai_estimate" && input.report?.dimensions.length) {
    const weakest = input.report.dimensions.filter((dimension) => dimension.score !== null).sort((a, b) => a.score! - b.score!).slice(0, 2);
    const facultyThemes = new Set(items.slice(0, 2).map((item) => item.theme));
    const overlap = weakest.filter((dimension) => facultyThemes.has(themeOf(dimension.name, dimension.issue)));
    aiView = weakest.length ? `The blind AI's weakest criteria were ${weakest.map((dimension) => `${dimension.name} (${dimension.score}/10)`).join(" and ")} — ${overlap.length ? "the same area the faculty marked down" : "a different area from the faculty's, so the two read the work differently there"}.` : null;
  }
  return { official, lost, source, items, unattributed: Math.max(0, unattributed), facultyComments: comments, missingParts, late: input.late === true, interpretation, aiView };
}
