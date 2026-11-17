import { describe, expect, it } from "vitest";
import { structureFeedback } from "./structure";

// Invented feedback in the two stored shapes: the Mesa Feedback page (parts, labelled lines) and LMS rubric feedback
// (a score block, then headed paragraphs).
const mesaPage = [
  "Mesa Feedback page — Term 1, MRS 2 · Communication: 14/20 (read 2026-11-05).", "",
  "Pitch 1 6/8.5", "Written assessment 2/3", "",
  "Pitch 1", "What went well: A clear opening and a strong ending.", "Note: Look less rehearsed and make more eye contact.", "",
  "Written Assessment", "What to improve: However, the reasons are brief.", "Note: You named the main issues.",
].join("\n");

const lms = [
  "SCORE", "Problem breakdown: 15/20", "MVP testing: 5.5/10 (did not pass)", "Total: 20.5/30", "",
  "DECK & RUBRIC FEEDBACK",
  "The problem is broken into five clear sub-problems with a stated cost per decision, and the scope explains what is left out. The rollout has no timeline or targets, and the same speaker notes repeat on every slide. The assumptions carry no numbers and should be quantified.",
].join("\n");

describe("structuring stored feedback for reading", () => {
  it("separates part scores from points and keeps each point under its part", () => {
    const result = structureFeedback(mesaPage);
    expect(result.scores).toEqual([{ label: "Pitch 1", score: 6, max: 8.5, note: "" }, { label: "Written assessment", score: 2, max: 3, note: "" }]);
    expect(result.points).toEqual([
      { part: "Pitch 1", kind: "strength", text: "A clear opening and a strong ending." },
      { part: "Pitch 1", kind: "improve", text: "Look less rehearsed and make more eye contact." },
      { part: "Written Assessment", kind: "improve", text: "However, the reasons are brief." },
      { part: "Written Assessment", kind: "note", text: "You named the main issues." },
    ]);
  });

  it("reads a rubric score block and splits a long paragraph into sentences", () => {
    const result = structureFeedback(lms);
    expect(result.scores).toEqual([{ label: "Problem breakdown", score: 15, max: 20, note: "" }, { label: "MVP testing", score: 5.5, max: 10, note: "did not pass" }]);
    expect(result.points.map((point) => [point.part, point.kind])).toEqual([["Deck & rubric feedback", "strength"], ["Deck & rubric feedback", "improve"], ["Deck & rubric feedback", "improve"]]);
  });

  it("returns nothing for empty feedback", () => {
    expect(structureFeedback("")).toEqual({ scores: [], points: [] });
  });
});
