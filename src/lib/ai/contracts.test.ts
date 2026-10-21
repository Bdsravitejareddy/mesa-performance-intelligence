import { describe, expect, it } from "vitest";
import { parseJsonObject, validateEvaluation, validateRubricDraft } from "./contracts";

describe("AI response contracts", () => {
  const validSummary = {
    strengths: [{ title: "Clear structure", detail: "The answer follows a logical sequence.", sourceRefs: ["S1"], confidence: "high" }],
    improvements: [{ title: "Quantify market", detail: "Add a supported market estimate.", sourceRefs: ["S1"], confidence: "medium", whatStudentDid: "Named the audience.", courseExpectation: "Size the opportunity.", whyIncomplete: "No estimate was included.", illustrativeExample: "Illustrative: estimate reachable buyers from sourced assumptions.", rubricAlignment: "Market analysis criterion.", professionalApplication: "Prioritize product segments." }],
    actions: [{ title: "Add a market estimate", detail: "Show assumptions and source.", sourceRefs: ["S1"], confidence: "medium" }],
  };
  it("rejects invalid inferred rubric totals and criteria", () => {
    expect(validateRubricDraft({ criteria: [{ title: "Reasoning", description: "Explain the choice", weight: 80, maximumMarks: 80, sourceRefs: ["S1"] }, { title: "Evidence", description: "Use evidence", weight: 20, maximumMarks: 10, sourceRefs: ["S1"] }] }, 100)).toBeNull();
    expect(validateRubricDraft({ criteria: [{ title: "Reasoning", description: "Explain the choice", weight: 60, maximumMarks: 60, sourceRefs: ["S1"] }, { title: "Evidence", description: "Use evidence", weight: 40, maximumMarks: 40, sourceRefs: ["S1"] }] }, 100)?.criteria).toHaveLength(2);
  });

  it("requires three separately scored layers and citations to supplied sources", () => {
    const input = { mesaAcademic: { score: 80, findings: [{ criterion: "Application", finding: "Relevant", quote: "framework", sourceRefs: ["S1"], confidence: "medium" }] }, analytical: { score: 70, findings: [] }, professional: { score: null, findings: [] }, reconciliation: [], summary: validSummary };
    expect(validateEvaluation(input, new Set(["S1"]))).not.toBeNull();
    expect(validateEvaluation(input, new Set())).toBeNull();
  });

  it("requires complete evidence-linked summary sections and course-grounded improvement examples", () => {
    const input = { mesaAcademic: { score: 80, findings: [{ criterion: "Application", finding: "Relevant", quote: "framework", sourceRefs: ["S1"], confidence: "medium" }] }, analytical: { score: 70, findings: [] }, professional: { score: null, findings: [] }, reconciliation: [], summary: validSummary };
    expect(validateEvaluation(input, new Set(["S1"]))?.summary).toEqual(validSummary);
    expect(validateEvaluation({ ...input, summary: { ...validSummary, actions: [] } }, new Set(["S1"]))).toBeNull();
    expect(validateEvaluation({ ...input, summary: { ...validSummary, strengths: [{ ...validSummary.strengths[0], sourceRefs: ["UNKNOWN"] }] } }, new Set(["S1"]))).toBeNull();
    expect(validateEvaluation({ ...input, summary: { ...validSummary, strengths: [{ ...validSummary.strengths[0], sourceRefs: ["S1", 4] }] } }, new Set(["S1"]))).toBeNull();
    expect(validateEvaluation({ ...input, summary: { ...validSummary, strengths: [{ ...validSummary.strengths[0], detail: " " }] } }, new Set(["S1"]))).toBeNull();
    expect(validateEvaluation({ ...input, mesaAcademic: { score: 101, findings: [] } }, new Set(["S1"]))).toBeNull();
    expect(validateEvaluation({ ...input, summary: { ...validSummary, improvements: [{ ...validSummary.improvements[0], illustrativeExample: "better answer" }] } }, new Set(["S1"]))).toBeNull();
    expect(validateEvaluation({ ...input, summary: { ...validSummary, improvements: [{ ...validSummary.improvements[0], detail: "x".repeat(2500) }] } }, new Set(["S1"]))).toBeNull();
  });

  it("allows an explicitly insufficient evaluation layer to omit an invented score", () => {
    const input = { mesaAcademic: { score: null, findings: [{ criterion: "Application", finding: "The submission does not provide enough evidence to judge this criterion.", quote: "", sourceRefs: [], confidence: "insufficient" }] }, analytical: { score: null, findings: [{ criterion: "Calculation", finding: "No verifiable calculation was supplied.", quote: "", sourceRefs: [], confidence: "insufficient" }] }, professional: { score: null, findings: [] }, reconciliation: [], summary: validSummary };
    expect(validateEvaluation(input, new Set(["S1"]))?.mesaAcademic.score).toBeNull();
  });

  it("parses only valid JSON objects", () => {
    expect(parseJsonObject('{"ok":true}')).toEqual({ ok: true });
    expect(parseJsonObject("not json")).toBeNull();
    expect(parseJsonObject("[]")).toBeNull();
  });
});
