import type { BlindReport } from "@/lib/quality/engine";
import type { CodeReport } from "./code-score";
import { splitPoints } from "./compare";

// Where the marks went on an officially marked assessment. The lost marks (100 − official) are allocated to
// criteria from the faculty's own breakdown when the feedback gives one ("Market 2/5"); otherwise they are
// estimated from where the blind AI found the work weakest, and labelled as an estimate. Deterministic.

export type LossSource = "faculty_breakdown" | "ai_estimate";
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
  ["accuracy", /calculat|accura|formula|number|quant|data type|conversion|arithmetic|lookup|function|metric|figure/i],
  ["interpretation", /insight|interpret|analys|reason|rigou?r|depth|hypothes|validat|evidence|conclu|problem/i],
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

export function markLoss(input: { official: number | null; feedback: string; report: BlindReport | null; codeReport: CodeReport | null; late: boolean | null }): MarkLoss | null {
  const { official } = input;
  if (official === null || official >= 100) return null;
  const lost = round1(100 - official);
  const breakdown = facultyBreakdown(input.feedback);
  const comments = splitPoints(input.feedback).filter((point) => !/\d+(?:\.\d+)?\s*\/\s*\d+/.test(point) || point.length > 80).slice(0, 6);
  let items: LossItem[] = [];
  let source: LossSource = "ai_estimate";
  if (breakdown.length) {
    source = "faculty_breakdown";
    const shortfall = breakdown.reduce((sum, item) => sum + (item.max - item.got), 0);
    items = breakdown.filter((item) => item.got < item.max).map((item) => {
      const related = comments.find((comment) => item.criterion.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 3).some((word) => comment.toLowerCase().includes(word)));
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
  const basis = source === "faculty_breakdown" ? "the faculty's own breakdown" : "where the blind AI found the work weakest (an estimate — no faculty breakdown was given)";
  const interpretation = ranked.length
    ? `Of the ${lost} marks lost, about ${round1(ranked[0][1])} sit in ${THEME_LABEL[ranked[0][0]]}${ranked[1] ? ` and ${round1(ranked[1][1])} in ${THEME_LABEL[ranked[1][0]]}` : ""}, going by ${basis}. In short: ${MEANING[ranked[0][0]]}.${input.late ? " It was also submitted late; any late penalty is inside the official mark." : ""}`
    : `${lost} marks were lost, but there is no faculty breakdown and no AI grade to show where.${input.late ? " It was submitted late, so part of the loss may be a late penalty." : ""}`;

  // How the blind AI's weakest criteria line up with the faculty's breakdown.
  let aiView: string | null = null;
  if (source === "faculty_breakdown" && input.report?.dimensions.length) {
    const weakest = input.report.dimensions.filter((dimension) => dimension.score !== null).sort((a, b) => a.score! - b.score!).slice(0, 2);
    const facultyThemes = new Set(items.slice(0, 2).map((item) => item.theme));
    const overlap = weakest.filter((dimension) => facultyThemes.has(themeOf(dimension.name, dimension.issue)));
    aiView = weakest.length ? `The blind AI's weakest criteria were ${weakest.map((dimension) => `${dimension.name} (${dimension.score}/10)`).join(" and ")} — ${overlap.length ? "the same area the faculty marked down" : "a different area from the faculty's, so the two read the work differently there"}.` : null;
  }
  return { official, lost, source, items: items.slice(0, 6), facultyComments: comments, missingParts, late: input.late === true, interpretation, aiView };
}
