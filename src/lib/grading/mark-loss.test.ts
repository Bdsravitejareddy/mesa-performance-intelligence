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
