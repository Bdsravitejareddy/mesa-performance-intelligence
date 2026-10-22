import { describe, expect, it } from "vitest";
import { ITEMS, scorePersonality } from "./personality";

describe("Mini-IPIP scoring", () => {
  it("has four items per factor with the published keying", () => {
    for (const factor of ["extraversion", "agreeableness", "conscientiousness", "neuroticism", "intellect"]) expect(ITEMS.filter((item) => item.factor === factor)).toHaveLength(4);
    expect(ITEMS.filter((item) => item.factor === "intellect" && item.reverse)).toHaveLength(3);
  });

  it("reverse-scores keyed items and bands on the scale itself", () => {
    const allAgree = Object.fromEntries(ITEMS.map((item) => [item.id, 5]));
    const result = scorePersonality(allAgree);
    expect(result.complete).toBe(true);
    // Extraversion: two forward (5+5) and two reversed (1+1) = 12.
    expect(result.factors.extraversion).toEqual({ score: 12, band: "middle" });
    // Intellect: one forward (5) and three reversed (1+1+1) = 8.
    expect(result.factors.intellect).toEqual({ score: 8, band: "lower" });
  });

  it("marks incomplete questionnaires", () => {
    expect(scorePersonality({ p1: 5 }).complete).toBe(false);
  });
});
