import { describe, expect, it } from "vitest";
import { personalityTips } from "./tips";

const factor = (score: number | null) => ({ score, confidence: "medium" as const, reason: "", quote: "", sourceId: "" });
describe("personality tips", () => {
  it("only gives a tip when the questionnaire and written context agree on a clear trait", () => {
    const tips = personalityTips({
      self: { extraversion: 4.2, agreeableness: 4.3, conscientiousness: 4.8, neuroticism: 1.7, intellect: 5 },
      context: { date: "", summary: "", sources: [], factors: { extraversion: factor(null), agreeableness: factor(3), conscientiousness: factor(4.1), neuroticism: factor(1.9), intellect: factor(5) } },
    });
    expect(tips.map((tip) => tip.trait)).toEqual(["Highly conscientious", "High in intellect", "Emotionally steady"]);
    expect(personalityTips({ self: null, context: null })).toEqual([]);
  });
});
