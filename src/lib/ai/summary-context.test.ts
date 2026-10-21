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
    expect(result.sources.map((source) => source.key)).toEqual(["M1", "F1", "E1", "M2"]);
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
    const evaluation: InsightSourceRecord = { kind: "evaluation", id: "report-one", label: "Assessment", course: "Course", summary: { strengths: [{ title: "Use", detail: "Applied the framework.", sourceRefs: ["S1"] }] }, sourceReferences: [{ key: "S1", label: "Notes page 1" }], scores: { mesaAcademic: 80, analytical: 70, professional: null }, status: "insufficient_evidence", evidence: [{ id: "evidence-one", layer: "mesa_academic", criterion: "Application", finding: "Applied framework", confidence: "high", sourceReference: "Notes page 1", submissionQuote: "I applied the framework." }] };
    const baselineRecords: InsightSourceRecord[] = [mark, evaluation];
    const hash = (records: InsightSourceRecord[], config = "config-v1") => createInsightSummaryInputHash(buildInsightSummaryContext(records), "model", "disclosure-v1", config);
    const base = hash(baselineRecords);
    expect(hash([{ ...mark, score: 81 }, evaluation])).not.toBe(base);
    expect(hash([{ ...mark, feedback: "Add evidence" }, evaluation])).not.toBe(base);
    const changedEvaluation: InsightSourceRecord = { ...evaluation, summary: { strengths: [{ title: "Use", detail: "Applied the framework differently.", sourceRefs: ["S1"] }] } };
    expect(hash([mark, changedEvaluation])).not.toBe(base);
    expect(hash([mark, { ...evaluation, scores: { ...evaluation.scores!, mesaAcademic: 81 } }])).not.toBe(base);
    expect(hash([mark, { ...evaluation, evidence: [{ ...evaluation.evidence![0], id: "evidence-two" }] }])).not.toBe(base);
    expect(hash([mark, { ...evaluation, evidence: [{ ...evaluation.evidence![0], finding: "A changed evidence conclusion" }] }])).not.toBe(base);
    expect(hash(baselineRecords, "config-v2")).not.toBe(base);
  });

  it("interleaves official marks and saved evaluations beyond fifty assessments", () => {
    const marks: InsightSourceRecord[] = Array.from({ length: 75 }, (_, index) => ({ kind: "mark", id: `m${index}`, label: `Assessment ${index}`, score: 70, maximum: 100, feedback: "Consistent performance.", course: "Course" }));
    const evaluations: InsightSourceRecord[] = Array.from({ length: 75 }, (_, index) => ({ kind: "evaluation", id: `report-e${index}`, label: `Assessment ${index}`, course: "Course", summary: { strengths: [{ title: "Application", detail: "Applied taught framework.", sourceRefs: ["S1"] }] }, sourceReferences: [{ key: "S1", label: "Course notes v1 p.1" }], scores: { mesaAcademic: 80, analytical: 75, professional: 60 }, status: "draft", evidence: [{ id: `ev${index}`, layer: "mesa_academic", criterion: "Application", finding: "Applied framework", confidence: "high", sourceReference: "Course notes v1 p.1", submissionQuote: "I applied the framework." }] }));
    const result = buildInsightSummaryContext([...marks, ...evaluations]);
    expect(result.sampleCounts.marks).toBeGreaterThan(0);
    expect(result.sampleCounts.evaluations).toBeGreaterThan(0);
    expect(result.context).toContain("Mesa academic=80");
    expect(result.context).toContain("report report-e0");
    expect(result.context).toContain("evidence ev0");
    expect(result.context).toContain("Official submission m0");
  });
});
