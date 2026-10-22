import { describe, expect, it } from "vitest";
import { buildBlindReport, compareChecks, resolveStandard, type Standard } from "./engine";

const standard: Standard = { source: "member_supplied", label: "Criteria you supplied", criteria: [{ name: "Market sizing", description: "", weight: 2 }, { name: "Clarity", description: "", weight: 1 }] };
const work = "We estimate the market at ₹1,200 crore using 4 million urban households.\nRecommendation: launch in Bangalore first.";

describe("blind quality report", () => {
  it("computes the overall from weighted criterion scores, not the model's own overall", () => {
    const report = buildBlindReport({ overall: 99, dimensions: [{ name: "Market sizing", score: 6, evidence: "using 4 million urban households" }, { name: "Clarity", score: 9, evidence: "launch in Bangalore first" }], confidence: "high" }, standard, work);
    expect(report.overall).toBe(70);
    expect(report.dimensions.every((dimension) => dimension.evidenceVerified)).toBe(true);
    expect(report.label).toMatch(/not an official Mesa grade/);
  });

  it("flags quotes that are not in the work and lowers confidence", () => {
    const report = buildBlindReport({ dimensions: [{ name: "Market sizing", score: 6, evidence: "TAM of $5bn" }, { name: "Clarity", score: 8, evidence: "launch in Bangalore first" }], confidence: "high" }, standard, work);
    expect(report.dimensions[0].evidenceVerified).toBe(false);
    expect(report.confidence).toBe("medium");
  });

  it("keeps an unjudgeable criterion unscored instead of zero", () => {
    const report = buildBlindReport({ dimensions: [{ name: "Market sizing", score: 5 }, { name: "Clarity", score: null }] }, standard, work);
    expect(report.dimensions[1].score).toBeNull();
    expect(report.overall).toBe(50);
  });

  it("warns that small score changes are noise", () => {
    const before = buildBlindReport({ dimensions: [{ name: "Market sizing", score: 5 }, { name: "Clarity", score: 7 }] }, standard, work);
    const after = buildBlindReport({ dimensions: [{ name: "Market sizing", score: 7 }, { name: "Clarity", score: 7 }] }, standard, work);
    const comparison = compareChecks(before, after, true);
    expect(comparison.dimensions[0]).toEqual({ name: "Market sizing", before: 5, after: 7 });
    expect(comparison.caveat).toMatch(/noise/);
    expect(compareChecks(before, after, false).caveat).toMatch(/not directly comparable/);
  });
});

describe("choosing the standard", () => {
  it("uses member criteria verbatim, one per line", async () => {
    const result = await resolveStandard({} as never, { mode: "criteria", criteriaText: "- States assumptions\n- Sizes the market\n\n3. Gives a recommendation" });
    expect(result.source).toBe("member_supplied");
    expect(result.criteria.map((criterion) => criterion.name)).toEqual(["States assumptions", "Sizes the market", "Gives a recommendation"]);
  });

  it("labels general role expectations as unsourced", async () => {
    const result = await resolveStandard({} as never, { mode: "role", roleTitle: "Technical Product Manager" });
    expect(result.source).toBe("model_general");
    expect(result.label).toMatch(/not sourced from a job posting/);
  });

  it("prefers an official rubric over an approved inferred one", async () => {
    const tables: Record<string, unknown> = {
      assessments: { id: "a1", course_id: "c1", title: "Mid-term", assessment_format: "case" },
      rubrics: [{ id: "inferred", source_kind: "inferred", approval_status: "approved" }, { id: "official", source_kind: "official", approval_status: "approved" }],
      rubric_criteria: [{ title: "Problem framing", description: "Defines the problem", weight: 40 }],
    };
    const used: string[] = [];
    const client = { from(table: string) { const chain: Record<string, unknown> = {}; chain.select = () => chain; chain.order = () => chain; chain.eq = (key: string, value: string) => { if (table === "rubric_criteria") used.push(value); return chain; }; chain.maybeSingle = async () => ({ data: tables[table] }); chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] }).then(resolve); return chain; } };
    const result = await resolveStandard(client as never, { mode: "criteria", assessmentId: "a1" });
    expect(result.source).toBe("official_rubric");
    expect(used).toEqual(["official"]);
  });
});

describe("blind evaluation isolation", () => {
  it("sends only the work and the standard in the blind pass; context only in the separate pass", async () => {
    const { vi } = await import("vitest");
    const { blindEvaluate, contextualAssessment } = await import("./engine");
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true"); vi.stubEnv("GEMINI_API_KEY", "g"); vi.stubEnv("AI_API_BASE_URL", ""); vi.stubEnv("AI_API_KEY", "");
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      const content = bodies.length === 1 ? { dimensions: [{ name: "Market sizing", score: 6, evidence: "using 4 million urban households" }, { name: "Clarity", score: 8 }], confidence: "medium" } : { notes: ["The official mark is higher than the model evaluation."], priorities: ["Show the sizing steps."] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
    }));
    const blind = await blindEvaluate(work, standard, "case_solution");
    const blindRequest = JSON.parse(JSON.parse(bodies[0]).messages[1].content);
    expect(Object.keys(blindRequest).sort()).toEqual(["standard", "work", "workKind"]);
    expect(JSON.parse(bodies[0]).messages[0].content).toMatch(/know nothing about its author/);
    const contextual = await contextualAssessment(blind, { officialMark: 92, officialFeedback: "Strong work" });
    expect(bodies[1]).toContain("92");
    expect(contextual.contextUsed).toEqual(["official mark", "official feedback"]);
    expect(blind.overall).toBe(66.7);
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });
});
