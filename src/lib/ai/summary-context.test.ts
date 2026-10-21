import { describe, expect, it } from "vitest";
import { buildInsightSummaryContext, createInsightSummaryInputHash, type InsightSourceRecord } from "./summary-context";

describe("whole-workspace insight summary context", () => {
  it("aggregates evidence with stable source keys and sample counts", () => {
    const result = buildInsightSummaryContext([
      { kind: "mark", id: "m1", label: "Finance · Mid term", score: 78, maximum: 100, feedback: "Strong calculations", course: "Finance" },
      { kind: "mark", id: "m2", label: "Marketing · Mid term", score: 64, maximum: 100, feedback: "", course: "Marketing" },
      { kind: "evaluation", id: "e1", label: "Finance · Mid term", summary: { strengths: [{ title: "Accurate formulas", detail: "Formula selection was sound.", sourceRefs: ["S1"], confidence: "high" }], improvements: [], actions: [] }, sourceReferences: [{ key: "S1", label: "Finance lecture notes v1, page 4" }], course: "Finance" },
      { kind: "personality", id: "secret", rawAnswers: "private" } as never,
      { kind: "contact", id: "secret2", notes: "private" } as never,
    ]);
    expect(result.sampleCounts).toEqual({ marks: 2, feedback: 1, evaluations: 1 });
    expect(result.sources.map((source) => source.key)).toEqual(["M1", "F1", "M2", "E1"]);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.context).toContain("Finance");
  });

  it("does not turn absent evidence into a claim", () => {
    const result = buildInsightSummaryContext([]);
    expect(result.sampleCounts).toEqual({ marks: 0, feedback: 0, evaluations: 0 });
    expect(result.sources).toEqual([]);
    expect(result.context).toContain("No eligible evidence");
  });

  it("excludes evaluation findings whose source keys are not in the saved reference list", () => {
    const result = buildInsightSummaryContext([{ kind: "evaluation", id: "e1", label: "Assessment", course: "Course", summary: { strengths: [{ title: "Claim", detail: "Unsupported detail.", sourceRefs: ["S9"] }] }, sourceReferences: [{ key: "S1", label: "Course notes p.1" }] }]);
    expect(result.sampleCounts.evaluations).toBe(0);
    expect(result.context).toContain("No eligible evidence");
  });

  it("invalidates the whole-workspace cache when marks, feedback, or saved evaluation evidence changes", () => {
    const mark: InsightSourceRecord = { kind: "mark", id: "m1", label: "Assessment", score: 80, maximum: 100, feedback: "Good", course: "Course" };
    const evaluation: InsightSourceRecord = { kind: "evaluation", id: "e1", label: "Assessment", course: "Course", summary: { strengths: [{ title: "Use", detail: "Applied the framework.", sourceRefs: ["S1"] }] }, sourceReferences: [{ key: "S1", label: "Notes page 1" }] };
    const baselineRecords: InsightSourceRecord[] = [mark, evaluation];
    const hash = (records: InsightSourceRecord[]) => createInsightSummaryInputHash(buildInsightSummaryContext(records), "model", "disclosure-v1");
    const base = hash(baselineRecords);
    expect(hash([{ ...mark, score: 81 }, evaluation])).not.toBe(base);
    expect(hash([{ ...mark, feedback: "Add evidence" }, evaluation])).not.toBe(base);
    const changedEvaluation: InsightSourceRecord = { ...evaluation, summary: { strengths: [{ title: "Use", detail: "Applied the framework differently.", sourceRefs: ["S1"] }] } };
    expect(hash([mark, changedEvaluation])).not.toBe(base);
  });
});
