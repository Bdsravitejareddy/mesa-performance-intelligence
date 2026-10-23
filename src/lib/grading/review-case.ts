import type { BlindReport } from "@/lib/quality/engine";
import type { CodeReport } from "./code-score";
import type { Comparison } from "./compare";

// When a blind grade sits well above the official mark, this sets out whether the gap rests on verifiable
// evidence. It never says the official mark is wrong: it lists the criteria, the exact quotes from the work,
// and everything that could explain the official mark, so the student can decide whether to ask for a review.
export const REVIEW_GAP = 8;

export type ReviewPoint = { criterion: string; score: number; quote: string; strength: string };
export type ReviewCase = {
  strength: "strong" | "moderate";
  gap: number;
  points: ReviewPoint[];
  corroboration: string[];
  counterpoints: string[];
  question: string;
};

const OFFICIAL_SOURCES = new Set(["official_rubric", "approved_rubric"]);

export function reviewCase(input: {
  official: number | null; ai: number | null; code: number | null;
  report: BlindReport | null; codeReport: CodeReport | null; comparison: Comparison | null;
  standardSource: string; late: boolean | null; assessment: string;
}): ReviewCase | null {
  const { official, ai, report } = input;
  if (official === null || ai === null || !report) return null;
  const gap = Math.round((ai - official) * 10) / 10;
  if (gap < REVIEW_GAP || report.confidence === "low") return null;
  // Only criteria the AI scored well and backed with a quote found verbatim in the submitted work count.
  const points = report.dimensions
    .filter((dimension) => dimension.score !== null && dimension.score >= 7 && dimension.evidenceVerified && dimension.evidence.trim())
    .map((dimension) => ({ criterion: dimension.name, score: dimension.score!, quote: dimension.evidence.trim().slice(0, 280), strength: dimension.strength }));
  if (points.length < 2) return null;

  const completeness = input.codeReport?.completeness ?? null;
  const parts = input.codeReport?.parts ?? [];
  const corroboration: string[] = [];
  if (completeness !== null && parts.length) corroboration.push(`The code check found ${parts.filter((part) => part.answered).length} of ${parts.length} parts of the brief answered (${completeness}%).`);
  const agreed = input.comparison?.agreed.length ?? 0;
  if (agreed) corroboration.push(`The AI independently raised ${agreed} of the same point${agreed === 1 ? "" : "s"} as the faculty, so it read the work in a comparable way.`);

  const counterpoints: string[] = [];
  if (!OFFICIAL_SOURCES.has(input.standardSource)) counterpoints.push("The AI graded against criteria inferred from the brief, not the official rubric; official criteria or weights may differ.");
  if (input.late) counterpoints.push("The work was submitted late; a late penalty, if applied, is part of the official mark and invisible to the AI.");
  if (completeness !== null && completeness < 70) counterpoints.push(`The code check could locate only ${completeness}% of the brief's parts; if parts are missing, the official mark may reflect that.`);
  for (const point of (input.comparison?.facultyOnly ?? []).slice(0, 3)) counterpoints.push(`Faculty raised a point the AI did not: “${point.slice(0, 200)}”`);
  for (const requirement of report.missingRequirements.slice(0, 2)) counterpoints.push(`The AI itself noted an unmet requirement: ${requirement.slice(0, 200)}`);
  counterpoints.push("Faculty may assess things the AI cannot see: presentation, peer or class participation, visuals, or standards applied across the cohort.");

  const strongBasis = OFFICIAL_SOURCES.has(input.standardSource) && !input.late && points.length >= 3 && (completeness === null || completeness >= 80) && report.confidence === "high" && !(input.comparison?.facultyOnly.length);
  const top = points.slice().sort((a, b) => b.score - a.score)[0];
  return {
    strength: strongBasis ? "strong" : "moderate",
    gap, points, corroboration, counterpoints,
    question: `Could you help me understand how “${top.criterion}” was assessed in ${input.assessment}? I believed it was addressed here: “${top.quote.slice(0, 160)}”. I'd like to know what a stronger answer would have shown.`,
  };
}
