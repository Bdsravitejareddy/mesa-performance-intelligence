import { describe, expect, it } from "vitest";
import { chooseTarget, reflectionPrompt } from "./target";
import type { CompetencyDomain } from "@/lib/competency/map";

const entry = (id: string, state: string, headline: string, band: "high" | "low" | "middle" | "unscored" = "middle") => ({ id, domain_key: "d", domain_name: "D", name: id.toUpperCase(), description: "Understanding users and their jobs to be done.", sort_order: 0, mappedAssessments: 2,
  assessment: { state, confidence: "low", headline, why: { evidence: [{ assessmentId: `a-${id}`, band }], benchmark: "", interpretation: "", limitations: [], wouldChangeThis: "" } } });
const domains = (entries: ReturnType<typeof entry>[]) => [{ key: "d", name: "Product thinking", competencies: entries }] as unknown as CompetencyDomain[];

describe("practice target", () => {
  it("prefers conflicting evidence, then development areas", () => {
    const target = chooseTarget(domains([entry("strategy", "development_area", "Low results in 2 assessments"), entry("needs", "conflicting", "1 high and 1 low result")]), new Set());
    expect(target).toMatchObject({ id: "needs", domain: "Product thinking", assessmentIds: ["a-needs"] });
    expect(target!.reason).toMatch(/results disagree \(1 high and 1 low result\)/);
  });
  it("falls back to a role need with no evidence, and writes an everyday reflection", () => {
    const target = chooseTarget(domains([entry("sql", "insufficient_evidence", "Mapped, but no released mark", "unscored")]), new Set(["sql"]))!;
    expect(target.reason).toMatch(/target roles need it/);
    expect(reflectionPrompt(target)).toMatch(/^Outside work or study, tell the story of a time when sql mattered \(understanding users/);
    expect(chooseTarget(domains([entry("x", "demonstrated_strength", "")]), new Set())).toBeNull();
  });
});
