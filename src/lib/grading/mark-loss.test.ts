import { describe, expect, it } from "vitest";
import { facultyBreakdown, markLoss } from "./mark-loss";
import type { BlindReport } from "@/lib/quality/engine";

const dim = (name: string, score: number, issue = "") => ({ name, score, evidence: "", evidenceVerified: false, strength: "", issue, improvement: "", exampleRevision: "" });
const report = (dimensions: ReturnType<typeof dim>[]): BlindReport => ({ overall: 60, dimensions, strengths: [], issues: [], missingRequirements: [], summary: "", confidence: "high", label: "" });

describe("where the marks went", () => {
  it("reads the faculty's criterion breakdown", () => {
    expect(facultyBreakdown("Problem & validation 3/5 | Customer, market & competition 2/5 | MVP concept 3/5 | GTM foundations 2/5")).toEqual([
      { criterion: "Problem & validation", got: 3, max: 5 }, { criterion: "Customer, market & competition", got: 2, max: 5 }, { criterion: "MVP concept", got: 3, max: 5 }, { criterion: "GTM foundations", got: 2, max: 5 },
    ]);
  });
  it("allocates the lost marks to the faculty's criteria and names the main theme", () => {
    const result = markLoss({ official: 51, feedback: "Problem & validation 3/5 | Customer, market & competition 2/5 | MVP concept 3/5 | GTM foundations 2/5\nMarket: no market size and no analysis of existing tools.", report: null, codeReport: null, late: false })!;
    expect(result.source).toBe("faculty_breakdown");
    expect(result.lost).toBe(49);
    expect(result.items.reduce((sum, item) => sum + item.lost, 0)).toBeCloseTo(49, 0);
    expect(result.items[0].criterion).toBe("Customer, market & competition");
    expect(result.interpretation).toMatch(/market and customer analysis/);
    expect(result.facultyComments.join(" ")).not.toMatch(/3\/5/);
    expect(result.items.find((item) => /market/i.test(item.criterion))?.detail).toMatch(/no market size/);
  });
  it("falls back to an AI estimate, labelled as such, and notes lateness", () => {
    const result = markLoss({ official: 60, feedback: "", report: report([dim("Interpretation of results", 4, "Conclusions not tied to the numbers"), dim("Formula accuracy", 8), dim("Presentation", 9)]), codeReport: null, late: true })!;
    expect(result.source).toBe("ai_estimate");
    expect(result.items[0]).toMatchObject({ criterion: "Interpretation of results", theme: "interpretation" });
    expect(result.items[0].lost).toBeCloseTo(26.7, 1);
    expect(result.interpretation).toMatch(/estimate[\s\S]*late/);
  });
  it("says nothing for full marks", () => {
    expect(markLoss({ official: 100, feedback: "", report: null, codeReport: null, late: null })).toBeNull();
  });
});

describe("question-by-question feedback", () => {
  const feedback = [
    "FEEDBACK (A-D): A (10 marks, formula required): Q1 — total units: Correct. Q2 — stores open: Correct.",
    "B (20 marks, formula optional): Q1 — average price: Correct answer, but cell not formatted. Small deduction. Q2 — returns in Pune: You got 9 — not quite right. Double-check your filter or formula for this one.",
    "C (30 marks — summary table): north: wrong values for: Units, Returns. south: wrong values for: Units, Returns. east: wrong values for: Units, Returns. Reminder: Units should include returned orders.",
    "---------- FEEDBACK (CASE QUESTION): 30/40. Good reasoning. What is missing or weak: no regional breakdown.",
  ].join(" ");
  it("splits the loss by section, keeping an explicitly scored section exact", () => {
    const result = markLoss({ official: 50, feedback, report: null, codeReport: null, late: false })!;
    expect(result.source).toBe("faculty_questions");
    expect(result.items.reduce((sum, item) => sum + item.lost, 0)).toBeCloseTo(50, 0);
    expect(result.items.find((item) => /CASE/.test(item.criterion))).toMatchObject({ lost: 10, detail: "Missing: no regional breakdown." });
    const table = result.items.find((item) => item.criterion.startsWith("C"))!;
    expect(table.detail).toMatch(/same error in 3 places[\s\S]*Reminder|reminder/);
    expect(result.items.find((item) => item.criterion.startsWith("B"))!.detail).toMatch(/returns in Pune/);
    expect(result.items.some((item) => item.criterion.startsWith("A"))).toBe(false);
  });
});
