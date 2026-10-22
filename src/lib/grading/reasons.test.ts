import { describe, expect, it } from "vitest";
import { differenceReasons } from "./reasons";

const code = { rulesVersion: "x", criteria: [{ name: "Answers", weight: 1, expected: ["a", "b", "c", "d", "e"], matched: ["a"], coverage: 0.2, score: 3.3 }], courseConcepts: { expected: [], matched: [], coverage: 0 }, wordCount: 400, arithmetic: { checked: 0, errors: [] }, adjustments: [], method: "" };
const ai = { overall: 95, dimensions: [{ name: "Answers", score: 10, evidence: "", evidenceVerified: true, strength: "", issue: "", improvement: "", exampleRevision: "" }], strengths: [], issues: [], missingRequirements: [], summary: "", confidence: "high" as const, label: "" };

describe("difference reasons", () => {
  it("explains an AI score far above the coverage score without picking a side", () => {
    const reasons = differenceReasons(code, ai, { ai: 95, code: 48, official: null }, 0);
    expect(reasons[0]).toMatch(/AI credited it 10\/10 although few of the criterion's words appear \(1 of 5\)/);
  });
  it("names the official gap and faculty-only points", () => {
    const reasons = differenceReasons(code, null, { ai: 60, code: 70, official: 80 }, 2);
    expect(reasons.join(" ")).toMatch(/official mark is 20 points above the AI\. The faculty raised 2 points/);
  });
});
