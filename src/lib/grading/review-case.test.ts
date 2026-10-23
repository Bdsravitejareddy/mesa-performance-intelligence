import { describe, expect, it } from "vitest";
import { reviewCase } from "./review-case";
import type { BlindReport } from "@/lib/quality/engine";

const dim = (name: string, score: number, verified = true) => ({ name, score, evidence: `quote for ${name}`, evidenceVerified: verified, strength: "clear", issue: "", improvement: "", exampleRevision: "" });
const report = (dimensions: ReturnType<typeof dim>[], confidence: BlindReport["confidence"] = "high"): BlindReport => ({ overall: 85, dimensions, strengths: [], issues: [], missingRequirements: [], summary: "", confidence, label: "" });
const base = { official: 70, ai: 85, code: 90, codeReport: null, comparison: null, standardSource: "official_rubric", late: false, assessment: "Mid-term" };

describe("case for a higher mark", () => {
  it("is raised only when verified, well-scored criteria back a clear gap", () => {
    const result = reviewCase({ ...base, report: report([dim("Analysis", 9), dim("Evidence", 8), dim("Structure", 8)]) })!;
    expect(result).toMatchObject({ strength: "strong", gap: 15 });
    expect(result.points).toHaveLength(3);
    expect(result.counterpoints.at(-1)).toMatch(/cannot see/);
  });
  it("is not raised for a small gap, low confidence, or unverified quotes", () => {
    expect(reviewCase({ ...base, ai: 75, report: report([dim("A", 9), dim("B", 9)]) })).toBeNull();
    expect(reviewCase({ ...base, report: report([dim("A", 9), dim("B", 9)], "low") })).toBeNull();
    expect(reviewCase({ ...base, report: report([dim("A", 9, false), dim("B", 9, false)]) })).toBeNull();
  });
  it("is moderate and names the caveats when criteria are inferred or the work was late", () => {
    const result = reviewCase({ ...base, standardSource: "assignment_brief_inferred", late: true, report: report([dim("A", 9), dim("B", 8), dim("C", 8)]) })!;
    expect(result.strength).toBe("moderate");
    expect(result.counterpoints.join(" ")).toMatch(/inferred from the brief[\s\S]*late/);
  });
});
