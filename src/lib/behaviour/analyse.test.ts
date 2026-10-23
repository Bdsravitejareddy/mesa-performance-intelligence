import { describe, expect, it } from "vitest";
import { DIMENSIONS, validateAnalysis, type Source } from "./analyse";

const sources: Source[] = [
  { id: "F1", kind: "official_feedback", label: "Feedback", text: "Market: no market size and no analysis of existing tools. Problem: the statement is written as a JTBD." },
  { id: "F2", kind: "official_feedback", label: "Feedback", text: "L1 Q3: you got 13 — not quite right. Double-check your filter or formula." },
];

describe("behaviour analysis validation", () => {
  it("keeps only verified quotes and caps strength by independent sources", () => {
    const result = validateAnalysis({ dimensions: [
      { dimension: "Problem framing", status: "observed", evidenceStrength: "substantial", observations: [{ sourceId: "F1", quote: "the statement is written as a JTBD" }], possibleExplanations: ["a", "b"], hypothesis: "Tends to frame problems in customer terms" },
      { dimension: "First-principles reasoning", status: "observed", evidenceStrength: "moderate", observations: [{ sourceId: "F1", quote: "an invented sentence" }] },
      { dimension: "Assumption identification", status: "observed", evidenceStrength: "substantial", observations: [{ sourceId: "F1", quote: "no market size" }, { sourceId: "F2", quote: "Double-check your filter or formula" }] },
    ] }, sources);
    expect(result).toHaveLength(DIMENSIONS.length);
    expect(result[0]).toMatchObject({ status: "observed", evidenceStrength: "limited" });
    expect(result[1]).toMatchObject({ status: "not_observed", evidenceStrength: "none", observations: [] });
    expect(result[2]).toMatchObject({ status: "observed", evidenceStrength: "moderate" });
  });

  it("reports every dimension as not observed when there is no evidence", () => {
    const result = validateAnalysis({}, []);
    expect(result.every((item) => item.status === "not_observed")).toBe(true);
  });
});

describe("learning from feedback", () => {
  const sources = [
    { id: "W1", kind: "graded_work" as const, label: "", text: "From the work: \"Without them (Weeks 4-6), about 213.\"" },
    { id: "A1", kind: "ai_profile" as const, label: "", text: "Accepted decision-making criticism" },
    { id: "F1", kind: "official_feedback" as const, label: "", text: "Market sizing is missing." },
  ];
  const row = (observations: { sourceId: string; quote: string }[]) => ({ dimensions: [{ dimension: "Learning from feedback", status: "observed", evidenceStrength: "limited", observedBehaviour: "x", observations }] });
  it("is not observed from self-made work or an assistant's opinion", () => {
    const result = validateAnalysis(row([{ sourceId: "W1", quote: "Without them (Weeks 4-6), about 213." }, { sourceId: "A1", quote: "Accepted decision-making criticism" }]), sources).find((item) => item.dimension === "Learning from feedback")!;
    expect(result.status).toBe("not_observed");
  });
  it("is observed when faculty feedback is part of the evidence", () => {
    const result = validateAnalysis(row([{ sourceId: "F1", quote: "Market sizing is missing." }]), sources).find((item) => item.dimension === "Learning from feedback")!;
    expect(result.status).toBe("observed");
  });
});
