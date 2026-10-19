import { describe, expect, it } from "vitest";
import { parseJsonObject, validateEvaluation, validateRubricDraft } from "./contracts";

describe("AI response contracts", () => {
  it("rejects invalid inferred rubric totals and criteria", () => {
    expect(validateRubricDraft({ criteria: [{ title: "Reasoning", description: "Explain the choice", weight: 80, maximumMarks: 80, sourceRefs: ["S1"] }, { title: "Evidence", description: "Use evidence", weight: 20, maximumMarks: 10, sourceRefs: ["S1"] }] }, 100)).toBeNull();
    expect(validateRubricDraft({ criteria: [{ title: "Reasoning", description: "Explain the choice", weight: 60, maximumMarks: 60, sourceRefs: ["S1"] }, { title: "Evidence", description: "Use evidence", weight: 40, maximumMarks: 40, sourceRefs: ["S1"] }] }, 100)?.criteria).toHaveLength(2);
  });

  it("requires three separately scored layers and citations to supplied sources", () => {
    const input = { mesaAcademic: { score: 80, findings: [{ criterion: "Application", finding: "Relevant", quote: "framework", sourceRefs: ["S1"], confidence: "medium" }] }, analytical: { score: 70, findings: [] }, professional: { score: null, findings: [] }, reconciliation: [] };
    expect(validateEvaluation(input, new Set(["S1"]))).not.toBeNull();
    expect(validateEvaluation(input, new Set())).toBeNull();
  });

  it("parses only valid JSON objects", () => {
    expect(parseJsonObject('{"ok":true}')).toEqual({ ok: true });
    expect(parseJsonObject("not json")).toBeNull();
    expect(parseJsonObject("[]")).toBeNull();
  });
});
