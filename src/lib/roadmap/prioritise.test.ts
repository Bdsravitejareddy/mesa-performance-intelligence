import { describe, expect, it } from "vitest";
import { evaluateOutcome, importanceFrom, recommend, type CompetencyInput } from "./prioritise";

const competency = (id: string, name: string, state: CompetencyInput["state"], extra: Partial<CompetencyInput> = {}): CompetencyInput => ({ id, name, domain: "D", state, confidence: "medium", headline: "", mappedAssessments: 1, hasLowResult: false, courses: ["Marketing"], ...extra });

describe("growth roadmap prioritisation", () => {
  const list = [
    competency("analytical.numerical_analysis", "Numerical analysis", "development_area"),
    competency("technical.sql", "SQL", "insufficient_evidence", { mappedAssessments: 0, confidence: "insufficient" }),
    competency("communication.clarity", "Clarity", "demonstrated_strength"),
    competency("leadership.ownership", "Ownership", "insufficient_evidence", { mappedAssessments: 0, confidence: "insufficient" }),
  ];

  it("ranks a role-required unproven skill and a demonstrated gap above strengths, and drops irrelevant unknowns", () => {
    const importance = importanceFrom(list, [{ text: "Strong SQL and analytics", required: true, role: "Senior TPM" }]);
    const ranked = recommend(list, importance, new Set());
    expect(ranked.map((item) => item.competencyId)).toEqual(["technical.sql", "analytical.numerical_analysis"]);
    expect(ranked[0].activity.title).toMatch(/applied SQL project/);
    expect(ranked[0].importance.reasons).toEqual(["Required by Senior TPM"]);
    expect(ranked[1].activity.kind).toBe("close_gap");
  });

  it("does not re-recommend a competency already in the plan", () => {
    const ranked = recommend(list, new Map(), new Set(["analytical.numerical_analysis"]));
    expect(ranked.some((item) => item.competencyId === "analytical.numerical_analysis")).toBe(false);
  });

  it("validates a single low result instead of treating it as a gap", () => {
    const [item] = recommend([competency("business.finance", "Finance", "insufficient_evidence", { hasLowResult: true, confidence: "low" })], new Map(), new Set());
    expect(item.activity.kind).toBe("validate");
  });
});

describe("roadmap outcomes", () => {
  it("never claims improvement without new evidence", () => {
    expect(evaluateOutcome({ state: "development_area", evidenceFingerprint: "a" }, { state: "development_area", evidenceFingerprint: "a" })).toBe("no_new_evidence");
    expect(evaluateOutcome({ state: "development_area", evidenceFingerprint: "a" }, { state: "meets_expectations", evidenceFingerprint: "b" })).toBe("improved");
    expect(evaluateOutcome({ state: "emerging", evidenceFingerprint: "a" }, { state: "development_area", evidenceFingerprint: "b" })).toBe("worse");
  });
});
