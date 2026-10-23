import { describe, expect, it } from "vitest";
import { groundOwnWords, projectStandard, projectWork } from "./evaluate";
import type { BlindReport } from "@/lib/quality/engine";

const dim = (name: string, score: number, evidence: string) => ({ name, score, evidence, evidenceVerified: true, strength: "", issue: "", improvement: "", exampleRevision: "" });

describe("project evaluation", () => {
  it("adds statement and own-words criteria only when that context exists", () => {
    expect(projectStandard(false, false).criteria.map((item) => item.name)).toEqual(["Problem understanding", "Solution design", "AI integration", "Implementation evidence"]);
    expect(projectStandard(true, true).criteria.map((item) => item.name)).toContain("Fit to the problem statement");
    expect(projectStandard(true, true).criteria.map((item) => item.name)).toContain("Communication of reasoning");
  });
  it("keeps the given problem statement out of the work", () => {
    const project = { structure: { files: 40, extensions: { ts: 30 }, topFolders: ["src"], hasTests: true, hasCi: false, partial: false }, key: "x", name: "X", accounts: [], description: "Bot", languages: ["Python"], aiPackages: ["anthropic"], commits: 3, activeMonths: ["2026-10"], deployed: true, deployments: 4, lastActivity: null, readme: "README text", isPublic: false };
    const { work } = projectWork(project, [{ project_key: "x", kind: "own_words", title: "", body: "I split the problem into intake and triage." }]);
    expect(work).toMatch(/In the member's own words:\nI split the problem/);
    // Deployment never reaches the grader: these are academic case studies.
    expect(work).not.toMatch(/production deployments|Deployed: /);
    expect(work).toMatch(/academic case-study tool/);
    expect(work).toMatch(/Repository structure \(code was not run\): 40 files/);
    expect(work).not.toMatch(/commits/);
  });
  it("scores communication only from a quote in the member's own words", () => {
    const report: BlindReport = { overall: 80, dimensions: [dim("Solution design", 8, "README text"), dim("Communication of reasoning", 9, "README text"), dim("First-principles reasoning", 7, "split the problem into intake")], strengths: [], issues: [], missingRequirements: [], summary: "", confidence: "high", label: "" };
    const grounded = groundOwnWords(report, "I split the problem into intake and triage.");
    expect(grounded.dimensions.map((item) => item.score)).toEqual([8, null, 7]);
    expect(grounded.overall).toBe(75);
    // With the rubric's weights, Solution design (weight 2) counts twice First-principles reasoning (weight 1).
    const weighted = groundOwnWords(report, "I split the problem into intake and triage.", { source: "model_general", label: "", criteria: [{ name: "Solution design", description: "", weight: 2 }, { name: "Communication of reasoning", description: "", weight: 1 }, { name: "First-principles reasoning", description: "", weight: 1 }] });
    expect(weighted.overall).toBe(76.7);
  });
});
