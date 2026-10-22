import type { CodeReport } from "./code-score";
import type { BlindReport } from "@/lib/quality/engine";

// Plain reasons for disagreement between the views, criterion by criterion. Deterministic wording from the
// figures; it explains the measurement difference and never says which view is right.
export function differenceReasons(code: CodeReport, ai: BlindReport | null, scores: { ai: number | null; code: number | null; official: number | null }, facultyOnly: number): string[] {
  const reasons: string[] = [];
  if (ai) {
    for (const criterion of code.criteria) {
      const dimension = ai.dimensions.find((item) => item.name === criterion.name);
      if (!dimension || dimension.score === null) continue;
      const gap = dimension.score - criterion.score;
      if (gap <= -3) reasons.push(`“${criterion.name}”: the work uses this criterion's vocabulary (${criterion.matched.length} of ${criterion.expected.length} key terms) but the AI judged the substance weaker (${dimension.score}/10)${dimension.issue ? ` — ${dimension.issue}` : "."}`);
      else if (gap >= 3) reasons.push(`“${criterion.name}”: the AI credited it ${dimension.score}/10 although few of the criterion's words appear (${criterion.matched.length} of ${criterion.expected.length}). Typical of short answers, numbers or tables, which the coverage score cannot read.`);
    }
  }
  if (scores.ai !== null && scores.code !== null && Math.abs(scores.ai - scores.code) >= 15 && !reasons.length) {
    reasons.push(scores.ai > scores.code
      ? "Overall the AI scored higher: the work answers the task without repeating the brief's wording, which a coverage score cannot credit."
      : "Overall the code scored higher: the right topics are present, but the AI judged accuracy, reasoning or completeness weaker.");
  }
  if (scores.official !== null && scores.ai !== null && Math.abs(scores.official - scores.ai) >= 10) {
    reasons.push(`The official mark is ${Math.abs(Math.round((scores.official - scores.ai) * 10) / 10)} points ${scores.official > scores.ai ? "above" : "below"} the AI.${facultyOnly ? ` The faculty raised ${facultyOnly} point${facultyOnly === 1 ? "" : "s"} the AI did not, which may account for part of it.` : ""} Official criteria and weights may differ from the brief-derived ones.`);
  }
  if (code.wordCount < 150) reasons.push(`Only ${code.wordCount} words of readable text were found, so the coverage score is capped; images, charts and formulas are not read.`);
  return reasons.slice(0, 6);
}
