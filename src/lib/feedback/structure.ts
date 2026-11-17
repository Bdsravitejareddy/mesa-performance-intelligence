import { classify, type Polarity } from "./repository";

// One piece of stored feedback, read for display: the part scores it lists ("Pitch 1 6.17/8.57", "MVP testing:
// 5.5/10 (did not pass)") and its points, each under the part it belongs to ("Pitch 2") and labelled as something
// that went well, something to work on, or a neutral note. Nothing is reworded; the original text stays available.
export type PartScore = { label: string; score: number; max: number; note: string };
export type FeedbackLine = { part: string; kind: Polarity; text: string };
export type StructuredFeedback = { scores: PartScore[]; points: FeedbackLine[] };

const SCORE = /^(.{1,80}?)\s*:?\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(\(.{1,60}\))?\.?$/;
// A heading is a short line with no sentence ending and no label colon ("Pitch 1", "Written Assessment",
// "DECK & RUBRIC FEEDBACK").
const HEADING = /^[A-Za-z0-9][A-Za-z0-9 &/+'’().,-]{0,58}$/;
const SKIP = /^(Mesa Feedback page — |SCORE$|Total\b)/i;

export function structureFeedback(text: string): StructuredFeedback {
  const scores: PartScore[] = [];
  const points: FeedbackLine[] = [];
  let part = "";
  const lines = (text ?? "").split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const line of lines) {
    if (SKIP.test(line)) continue;
    const score = SCORE.exec(line);
    if (score && !/[.!?]\s/.test(line)) {
      const max = Number(score[3]);
      if (max > 0) scores.push({ label: score[1].replace(/[:–—-]\s*$/, "").trim(), score: Number(score[2]), max, note: score[4]?.replace(/[()]/g, "") ?? "" });
      continue;
    }
    if (HEADING.test(line) && !/[.!?:]$/.test(line) && line.split(" ").length <= 6) { part = toTitle(line); continue; }
    // Long paragraphs (LMS rubric feedback) are read sentence by sentence; labelled lines keep their label.
    const sentences = line.length > 220 && !/^[A-Za-z ]{2,24}:/.test(line) ? line.split(/(?<=[.!?])\s+(?=[A-Z“"'])/) : [line];
    for (const sentence of sentences) {
      if (sentence.length < 8) continue;
      const { text: body, polarity } = classify(sentence);
      if (body) points.push({ part, kind: polarity, text: body });
    }
  }
  return { scores, points };
}

// "DECK & RUBRIC FEEDBACK" reads as "Deck & rubric feedback"; mixed-case headings are kept as written.
function toTitle(heading: string): string {
  return heading === heading.toUpperCase() && /[A-Z]{3}/.test(heading) ? heading.charAt(0) + heading.slice(1).toLowerCase() : heading;
}
