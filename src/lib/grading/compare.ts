import { terms } from "./code-score";

// Lines up the official feedback with the blind AI evaluation, point by point, using shared terms only.
// It reports agreement and differences; it never decides which view is right.
export type AlignedPoint = { feedback: string; ai: string; shared: string[] };
export type Comparison = {
  agreed: AlignedPoint[];
  facultyOnly: string[];
  aiOnly: string[];
  gaps: { aiMinusOfficial: number | null; codeMinusOfficial: number | null; aiMinusCode: number | null };
  agreement: "close" | "moderate" | "far" | "no_official_mark";
  note: string;
};

export function splitPoints(text: string): string[] {
  return text.split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"“(])|\s+[-•*]\s+/).map((part) => part.replace(/^[-•*\d.)\s]+/, "").trim()).filter((part) => (part.match(/\S+/g) ?? []).length >= 4).slice(0, 30);
}

function similarity(a: string[], b: string[]) {
  const left = new Set(a);
  const right = new Set(b);
  const shared = [...left].filter((term) => right.has(term));
  const union = new Set([...left, ...right]).size;
  return { shared, jaccard: union ? shared.length / union : 0 };
}

const gap = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.round((a - b) * 10) / 10);

export function compareWithFeedback(input: { feedback: string; aiPoints: string[]; official: number | null; ai: number | null; code: number | null }): Comparison {
  const feedbackPoints = splitPoints(input.feedback);
  const aiPoints = input.aiPoints.filter(Boolean).slice(0, 30);
  const aiTerms = aiPoints.map(terms);
  const usedAi = new Set<number>();
  const agreed: AlignedPoint[] = [];
  const facultyOnly: string[] = [];
  for (const point of feedbackPoints) {
    const pointTerms = terms(point);
    let best = { index: -1, shared: [] as string[], jaccard: 0 };
    aiTerms.forEach((candidate, index) => {
      const result = similarity(pointTerms, candidate);
      if (result.shared.length >= 2 && result.jaccard > best.jaccard) best = { index, ...result };
    });
    if (best.index >= 0 && best.jaccard >= 0.1) { agreed.push({ feedback: point, ai: aiPoints[best.index], shared: best.shared.slice(0, 6) }); usedAi.add(best.index); }
    else facultyOnly.push(point);
  }
  const aiOnly = aiPoints.filter((_, index) => !usedAi.has(index));
  const aiGap = gap(input.ai, input.official);
  const distance = aiGap === null ? null : Math.abs(aiGap);
  const agreement = distance === null ? "no_official_mark" : distance <= 7.5 ? "close" : distance <= 15 ? "moderate" : "far";
  const note = input.official === null
    ? "No official mark is recorded yet, so only the AI and code views can be compared."
    : `The AI is ${aiGap === null ? "unavailable" : aiGap === 0 ? "level with" : `${Math.abs(aiGap)} points ${aiGap > 0 ? "above" : "below"}`} the official mark. A difference is not evidence that either is wrong; the criteria and quotes show where they diverge.`;
  return { agreed, facultyOnly, aiOnly, gaps: { aiMinusOfficial: aiGap, codeMinusOfficial: gap(input.code, input.official), aiMinusCode: gap(input.ai, input.code) }, agreement, note };
}
