import type { BlindReport } from "@/lib/quality/engine";
import type { CodeReport } from "./code-score";
import { splitPoints } from "./compare";

// Where the marks went on an officially marked assessment. The lost marks (100 − official) are allocated to
// criteria from the faculty's own breakdown when the feedback gives one ("Market 2/5"); otherwise they are
// estimated from where the blind AI found the work weakest, and labelled as an estimate. Deterministic.

export type LossSource = "faculty_breakdown" | "faculty_questions" | "ai_estimate";
export type LossItem = { criterion: string; lost: number; detail: string; theme: Theme; got?: number; max?: number };
export type MarkLoss = {
  official: number; lost: number; source: LossSource;
  items: LossItem[];
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

export function markLoss(input: { official: number | null; feedback: string; report: BlindReport | null; codeReport: CodeReport | null; late: boolean | null }): MarkLoss | null {
  const { official } = input;
  if (official === null || official >= 100) return null;
  const lost = round1(100 - official);
  const sections = sectionBreakdown(input.feedback);
  const breakdown = sections.length ? [] : facultyBreakdown(input.feedback);
  // Comments are the faculty's sentences; the score line itself ("Market 2/5 | GTM 2/5") is not a comment.
  const comments = splitPoints(input.feedback).filter((point) => (point.match(/\d+(?:\.\d+)?\s*\/\s*\d+/g) ?? []).length < 2 && facultyBreakdown(point).length < 2).slice(0, 6);
  let items: LossItem[] = [];
  let source: LossSource = "ai_estimate";
  if (sections.length) {
    source = "faculty_questions";
    // Exact section scores stand; estimated sections share the rest of the lost marks in proportion.
    const exact = sections.filter((section) => section.exact).reduce((sum, section) => sum + section.lost, 0);
    const estimated = sections.filter((section) => !section.exact).reduce((sum, section) => sum + section.lost, 0);
    const scale = estimated ? Math.max(0, lost - exact) / estimated : 0;
    items = sections.filter((section) => section.lost > 0).map((section) => ({ criterion: section.name, lost: round1(section.exact ? section.lost : section.lost * scale), max: section.marks, got: section.exact ? section.marks - section.lost : undefined, detail: section.detail, theme: themeOf(section.name, section.detail) }));
  } else if (breakdown.length) {
    source = "faculty_breakdown";
    const shortfall = breakdown.reduce((sum, item) => sum + (item.max - item.got), 0);
    items = breakdown.filter((item) => item.got < item.max).map((item) => {
      const related = comments.find((comment) => item.criterion.toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 3).some((word) => comment.toLowerCase().includes(word)));
      return { criterion: item.criterion, got: item.got, max: item.max, lost: shortfall ? round1((lost * (item.max - item.got)) / shortfall) : 0, detail: related ?? "", theme: themeOf(item.criterion, related ?? "") };
    });
  } else if (input.report?.dimensions.length) {
    const scored = input.report.dimensions.filter((dimension) => dimension.score !== null);
    const shortfall = scored.reduce((sum, dimension) => sum + (10 - dimension.score!), 0);
    items = scored.filter((dimension) => dimension.score! < 10).map((dimension) => ({
      criterion: dimension.name, lost: shortfall ? round1((lost * (10 - dimension.score!)) / shortfall) : 0,
      detail: [dimension.issue, dimension.improvement && `To improve: ${dimension.improvement}`].filter(Boolean).join(" "), theme: themeOf(dimension.name, dimension.issue),
    }));
  }
  items.sort((a, b) => b.lost - a.lost);
  const missingParts = (input.codeReport?.parts ?? []).filter((part) => !part.answered).map((part) => `${part.label} ${part.text}`.slice(0, 140));

  // Interpretation: which kinds of criteria the lost marks sit in.
  const byTheme = new Map<Theme, number>();
  for (const item of items) byTheme.set(item.theme, (byTheme.get(item.theme) ?? 0) + item.lost);
  const ranked = [...byTheme.entries()].sort((a, b) => b[1] - a[1]);
  const basis = source === "faculty_breakdown" ? "the faculty's own breakdown" : source === "faculty_questions" ? "the faculty's question-by-question feedback" : "where the blind AI found the work weakest (an estimate — no faculty breakdown was given)";
  const interpretation = ranked.length
    ? `Of the ${lost} marks lost, about ${round1(ranked[0][1])} sit in ${THEME_LABEL[ranked[0][0]]}${ranked[1] ? ` and ${round1(ranked[1][1])} in ${THEME_LABEL[ranked[1][0]]}` : ""}, going by ${basis}. In short: ${MEANING[ranked[0][0]]}.${input.late ? " It was also submitted late; any late penalty is inside the official mark." : ""}`
    : `${lost} marks were lost, but there is no faculty breakdown and no AI grade to show where.${input.late ? " It was submitted late, so part of the loss may be a late penalty." : ""}`;

  // How the blind AI's weakest criteria line up with the faculty's breakdown.
  let aiView: string | null = null;
  if (source !== "ai_estimate" && input.report?.dimensions.length) {
    const weakest = input.report.dimensions.filter((dimension) => dimension.score !== null).sort((a, b) => a.score! - b.score!).slice(0, 2);
    const facultyThemes = new Set(items.slice(0, 2).map((item) => item.theme));
    const overlap = weakest.filter((dimension) => facultyThemes.has(themeOf(dimension.name, dimension.issue)));
    aiView = weakest.length ? `The blind AI's weakest criteria were ${weakest.map((dimension) => `${dimension.name} (${dimension.score}/10)`).join(" and ")} — ${overlap.length ? "the same area the faculty marked down" : "a different area from the faculty's, so the two read the work differently there"}.` : null;
  }
  return { official, lost, source, items: items.slice(0, 6), facultyComments: comments, missingParts, late: input.late === true, interpretation, aiView };
}
