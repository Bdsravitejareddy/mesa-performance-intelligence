import { describe, expect, it } from "vitest";
import { codeGrade, keyTerms, stem, terms } from "./code-score";

const criteria = [
  { name: "Market sizing", description: "Estimate the total addressable market using customer segments and pricing assumptions.", weight: 2 },
  { name: "Recommendation", description: "Recommend a go-to-market channel with risks and mitigation.", weight: 1 },
];
const course = ["Market sizing starts from customer segments. Pricing assumptions drive revenue. Channels carry risks that need mitigation."];
const long = (text: string) => `${text} ${"Further discussion of the operating context follows. ".repeat(30)}`;

describe("code score", () => {
  it("stems word families together and drops rubric filler", () => {
    expect(stem("pricing")).toBe(stem("priced"));
    expect(terms("Clearly demonstrates appropriate pricing")).toEqual([stem("pricing")]);
    expect(keyTerms("market market segment", 1)).toEqual(["market"]);
  });

  it("is deterministic and rewards work that addresses each criterion", () => {
    const strong = long("We size the addressable market from three customer segments with explicit pricing assumptions. We recommend a direct channel and list the risks with a mitigation plan.");
    const weak = long("This essay talks about the company history and its founders.");
    const a = codeGrade(strong, criteria, course);
    expect(codeGrade(strong, criteria, course)).toEqual(a);
    expect(a.score).toBeGreaterThan(70);
    expect(codeGrade(weak, criteria, course).score).toBeLessThan(25);
    expect(a.report.criteria[0].matched).toContain("market");
  });

  it("caps very short work and deducts arithmetic errors, and says so", () => {
    const short = codeGrade("Market segments and pricing assumptions; channel risks and mitigation. 2 + 2 = 5", criteria, course);
    expect(short.score).toBeLessThanOrEqual(50);
    expect(short.report.arithmetic.errors).toHaveLength(1);
    expect(short.report.adjustments.join(" ")).toMatch(/capped at 50/);
  });

  it("returns no score rather than inventing one when nothing can be measured", () => {
    expect(codeGrade("", criteria, course).score).toBeNull();
    expect(codeGrade("Some work here", [{ name: "The", description: "and of", weight: 1 }], course).score).toBeNull();
  });
});

import { briefParts, codeGradeV2, completeness } from "./code-score";
describe("completeness against the brief", () => {
  const brief = "Brief:\nAnswer all questions.\nQ1. Which three cities need more captains next month?\nQ2. Compute the average wait time per city and rank them.\nQ3. Recommend an incentive plan with its expected cost.";
  it("reads the brief's questions", () => {
    expect(briefParts(brief).map((part) => part.label)).toEqual(["Q1", "Q2", "Q3"]);
  });
  it("counts labelled and unlabelled answers, and reports what is missing", () => {
    const work = "Q1: Pune, Delhi, Jaipur based on demand gap.\nAverage wait time per city computed and ranked: Pune 9.2 min, Delhi 8.1 min.";
    const result = completeness(work, brief);
    expect(result.parts.map((part) => part.how)).toEqual(["label", "keywords", "missing"]);
    expect(result.score).toBe(66.7);
  });
  it("scores complete concise work highly even without the rubric's vocabulary", () => {
    const work = `Q1. Pune, Delhi, Jaipur.\nQ2. Pune 9.2, Delhi 8.1, Jaipur 7.4 minutes.\nQ3. Rs 40 per peak trip; cost Rs 2.1 lakh.\n${"Supporting analysis of the dataset follows. ".repeat(40)}`;
    const graded = codeGradeV2(work, [{ name: "Analytical rigour", description: "Demonstrates hypothesis-driven segmentation using cohort analysis", weight: 1 }], [], brief);
    expect(graded.report.completeness).toBe(100);
    expect(graded.score).toBeGreaterThan(75);
  });
  it("counts a part answered when the workbook uses the functions it names, and ignores cell references", () => {
    const sheetBrief = "Brief:\nQ1 LEFT, MID & RIGHT — slice text by position.\nQ5 SUBSTITUTE — find-and-replace inside a cell.\nQ9 TEXTJOIN & CONCAT — glue text together.";
    const work = "Sheet: Answers\nBLR | Deluxe\nFormulas used: LEFT, MID, SUBSTITUTE (40 formula cells)\nFormula B2 =LEFT(Q1,3)\nFormula Q9 =MID(A2,4,2)";
    expect(completeness(work, sheetBrief).parts.map((part) => part.how)).toEqual(["formula", "formula", "missing"]);
  });
});
