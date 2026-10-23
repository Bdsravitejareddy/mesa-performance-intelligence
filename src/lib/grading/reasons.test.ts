import { describe, expect, it } from "vitest";
import { differenceReasons } from "./reasons";

const code = { rulesVersion: "x", criteria: [{ name: "Answers", weight: 1, expected: ["a", "b", "c", "d", "e"], matched: ["a"], coverage: 0.2, score: 3.3 }], courseConcepts: { expected: [], matched: [], coverage: 0 }, wordCount: 400, arithmetic: { checked: 0, errors: [] }, adjustments: [], method: "" };
const ai = { overall: 95, dimensions: [{ name: "Answers", score: 10, evidence: "", evidenceVerified: true, strength: "", issue: "", improvement: "", exampleRevision: "" }], strengths: [], issues: [], missingRequirements: [], summary: "", confidence: "high" as const, label: "" };

describe("difference reasons", () => {
  it("says plainly when the brief has nothing for the code check to tick off", () => {
    const reasons = differenceReasons(code, ai, { ai: 95, code: null, official: null }, 0);
    expect(reasons[0]).toMatch(/doesn't list separate questions or tasks/);
  });
  it("explains unlabelled answers when the AI is far above completeness", () => {
    const parts = [{ label: "Q1", text: "", keywords: [], answered: true, how: "label" as const }, { label: "Q2", text: "", keywords: [], answered: false, how: "missing" as const }];
    const reasons = differenceReasons({ ...code, parts, completeness: 50 }, ai, { ai: 95, code: 55, official: null }, 0);
    expect(reasons[0]).toMatch(/found 1; it couldn't find Q2/);
    expect(reasons[1]).toMatch(/not labelled or worded/);
  });
  it("names the official gap and faculty-only points", () => {
    const reasons = differenceReasons(code, null, { ai: 60, code: 70, official: 80 }, 2);
    expect(reasons.join(" ")).toMatch(/official mark is 20 points higher than the AI's\. The faculty mentioned 2 things/);
  });
});
