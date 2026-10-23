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
      context: { ...context, date: "2026-10-23" }, skills: [],
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
