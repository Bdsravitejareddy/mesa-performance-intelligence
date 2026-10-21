import { describe, expect, it } from "vitest";
import { hiddenCriterionGaps, parseCriterionScores } from "./criteria";

describe("criterion marks in official feedback", () => {
  it("extracts a pipe-separated rubric breakdown", () => {
    const criteria = parseCriterionScores("Problem & validation 3/5 | Customer, market & competition 2/5 | MVP concept 3/5 | GTM foundations 2/5 Problem: the statement is written as a JTBD.");
    expect(criteria).toEqual([
      { label: "Problem & validation", score: 3, max: 5, percent: 60 },
      { label: "Customer, market & competition", score: 2, max: 5, percent: 40 },
      { label: "MVP concept", score: 3, max: 5, percent: 60 },
      { label: "GTM foundations", score: 2, max: 5, percent: 40 },
    ]);
  });

  it("handles colon and newline formats and decimals", () => {
    expect(parseCriterionScores("Structure: 4.5/5\nEvidence: 7/10\nTotal: 11.5/15")).toEqual([
      { label: "Structure", score: 4.5, max: 5, percent: 90 },
      { label: "Evidence", score: 7, max: 10, percent: 70 },
    ]);
  });

  it("ignores a single fraction in prose", () => {
    expect(parseCriterionScores("Good work overall, 18/20.")).toEqual([]);
  });

  it("ignores impossible scores, dates and question numbers", () => {
    expect(parseCriterionScores("Clarity 6/5 | Q1 2/3 | Q2 1/3 | due 12/10/2026")).toEqual([]);
  });

  it("returns nothing for feedback without a breakdown", () => {
    expect(parseCriterionScores("You got L0 (counting questions) almost completely right — well done.")).toEqual([]);
    expect(parseCriterionScores("")).toEqual([]);
  });

  it("flags low criteria hidden by an acceptable overall mark, not by a low overall mark", () => {
    const criteria = parseCriterionScores("Market sizing 2/10 | Strategy 9/10 | Communication 9/10");
    expect(hiddenCriterionGaps(criteria, 85).map((gap) => gap.label)).toEqual(["Market sizing"]);
    expect(hiddenCriterionGaps(criteria, 51)).toEqual([]);
    expect(hiddenCriterionGaps(criteria, null)).toEqual([]);
  });
});
