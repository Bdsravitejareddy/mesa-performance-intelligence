import { describe, expect, it } from "vitest";
import { validateReading } from "./context-reading";
import { netSummary } from "@/lib/profile/net-summary";

const sources = [{ id: "N1", label: "note", text: "I prefer objective decisions, but I do feel for people in the room." }];

describe("context personality reading", () => {
  it("scores a trait only when its quote is found in a source", () => {
    const reading = validateReading({ factors: {
      agreeableness: { score: 3.5, confidence: "medium", reason: "Empathy with objective framing.", quote: "I do feel for people in the room", sourceId: "N1" },
      extraversion: { score: 4.5, confidence: "high", reason: "Invented.", quote: "I love parties", sourceId: "N1" },
    }, summary: "Adds nuance." }, sources);
    expect(reading.factors.agreeableness).toMatchObject({ score: 3.5, confidence: "medium" });
    expect(reading.factors.extraversion).toMatchObject({ score: null, quote: "" });
    expect(reading.factors.intellect.score).toBeNull();
  });
});

describe("net summary", () => {
  it("names the most pronounced traits and the largest self/context difference", () => {
    const context = validateReading({ factors: { agreeableness: { score: 2.5, confidence: "medium", reason: "You put objectivity first.", quote: "I prefer objective decisions", sourceId: "N1" } } }, sources);
    const summary = netSummary({
      self: { extraversion: 3.2, agreeableness: 4.3, conscientiousness: 4.8, neuroticism: 1.7, intellect: 5 }, selfDate: null, note: "",
      context: { ...context, date: "2026-10-23" }, skills: [], aiViewDate: null, external: { sixteenP: null, clifton: [], neo: null },
      reasoning: [{ level: "standard", date: "", correct: 11, total: 12, scaled: 60, sections: { numerical: 100, logical: 100, verbal: 75 } }],
      behaviour: { observed: 0, total: 0, date: null, dimensions: [] },
    });
    expect(summary.headline).toMatch(/high in intellect/);
    expect(summary.headline).toMatch(/emotionally steady/);
    expect(summary.points.find((point) => point.title.startsWith("Self-report"))?.text).toMatch(/agreeableness: you rated 4\.3, your context reads 2\.5/);
    expect(summary.points.find((point) => point.title === "Reasoning")?.text).toMatch(/ceiling/);
    expect(summary.open).toMatch(/agreeableness/);
  });
});

describe("missing context scores", () => {
  it("keeps a null trait score unscored even when a quote is attached", () => {
    const reading = validateReading({ factors: { extraversion: { score: null, confidence: "low", reason: "", quote: "I prefer objective decisions", sourceId: "N1" } } }, [{ id: "N1", label: "", text: "I prefer objective decisions, but I do feel for people in the room." }]);
    expect(reading.factors.extraversion.score).toBeNull();
  });

  it("ranks traits by percentile on a long-form result and explains a self/context gap with its facets", () => {
    const context = validateReading({ factors: { agreeableness: { score: 2.5, confidence: "medium", reason: "You put objectivity first.", quote: "I prefer objective decisions", sourceId: "N1" } } }, sources);
    const trait = (percentile: number) => ({ raw: 200, max: 300, level: "high" as const, percentile, percentOfRange: 60 });
    const facet = (name: string, percentile: number) => ({ name, trait: "agreeableness" as const, raw: 40, max: 50, level: "high" as const, percentile });
    const neo = { form: "IPIP-NEO-300", takenOn: null, durationSeconds: null, normGroup: "", normNote: "", consistent: true,
      anomalies: ["Altruism is reported as high (46/50) but higher than only 48% of the comparison group; one of the two is likely wrong."],
      traits: { openness: trait(98), conscientiousness: trait(99), extraversion: trait(97), agreeableness: trait(88), neuroticism: trait(1) },
      facets: [facet("Trust", 94), facet("Sympathy", 94), facet("Altruism", 48), facet("Cooperation", 48), facet("Modesty", 50)] };
    const summary = netSummary({
      self: { extraversion: 4.2, agreeableness: 4.3, conscientiousness: 4.8, neuroticism: 1.7, intellect: 5 }, selfDate: null, note: "",
      context: { ...context, date: "2026-10-23" }, skills: [], aiViewDate: null, external: { sixteenP: null, clifton: [], neo },
      reasoning: [], behaviour: { observed: 0, total: 0, date: null, dimensions: [] },
    });
    expect(summary.headline).toBe("On the IPIP-NEO-300, your most distinctive traits: you describe yourself as very high in conscientiousness (99th percentile), unusually steady under stress (1st percentile for neuroticism), very high in openness to experience (98th percentile).");
    const facets = summary.points.find((point) => point.title === "What your facets say about agreeableness")?.text ?? "";
    expect(facets).toMatch(/high in Trust \(94%\), Sympathy \(94%\); around average in Cooperation \(48%\), Modesty \(50%\)/);
    expect(facets).toMatch(/Altruism left out/);
    expect(summary.open).toMatch(/trust or cooperation/);
  });
});
