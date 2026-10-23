import { describe, expect, it } from "vitest";
import { holistic, validateAiView } from "./skills";

describe("skill views", () => {
  const sources = [{ id: "W1", kind: "graded_work" as const, label: "", text: "From the work: \"Pricing should follow willingness to pay by segment\"" }, { id: "A1", kind: "ai_profile" as const, label: "", text: "A strong communicator" }];
  it("keeps an AI domain score only with a verified quote from a non-profile source", () => {
    const view = validateAiView({ domains: {
      "Business acumen": { score: 78, confidence: "high", reason: "Prices by segment.", quotes: [{ sourceId: "W1", quote: "Pricing should follow willingness to pay by segment" }] },
      Communication: { score: 90, confidence: "high", reason: "Profile says so.", quotes: [{ sourceId: "A1", quote: "A strong communicator" }] },
    } }, ["Business acumen", "Communication", "Leadership"], sources);
    expect(view["Business acumen"]).toMatchObject({ score: 78, confidence: "high" });
    expect(view.Communication.score).toBeNull();
    expect(view.Leadership.score).toBeNull();
  });
  it("blends views by evidence and confidence, and never treats a missing view as zero", () => {
    expect(holistic({ score: 90, evidence: 4 }, { score: 60, confidence: "high", reason: "", quotes: [] }, null, "Communication")).toBe(78);
    expect(holistic({ score: null, evidence: 0 }, { score: 60, confidence: "low", reason: "", quotes: [] }, null, "Leadership")).toBe(60);
    expect(holistic({ score: null, evidence: 0 }, null, 92, "Leadership")).toBeNull();
    expect(holistic({ score: 70, evidence: 1 }, null, 92, "Analytical reasoning")).toBeGreaterThan(70);
  });
});
