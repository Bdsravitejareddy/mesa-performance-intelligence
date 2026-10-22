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

import { generatePersonalityForm, POOL, scorePersonalityForm } from "./personality";

describe("randomised IPIP form", () => {
  it("draws 6 balanced items per factor, differs between seeds and repeats for the same seed", () => {
    const form = generatePersonalityForm(42);
    expect(form).toHaveLength(30);
    expect(POOL).toHaveLength(50);
    for (const factor of ["extraversion", "agreeableness", "conscientiousness", "neuroticism", "intellect"]) {
      const items = form.filter((item) => item.factor === factor);
      expect(items).toHaveLength(6);
      expect(items.filter((item) => item.reverse).length).toBe(factor === "neuroticism" ? 2 : 3);
    }
    expect(generatePersonalityForm(42).map((item) => item.id)).toEqual(form.map((item) => item.id));
    expect(generatePersonalityForm(43).map((item) => item.id)).not.toEqual(form.map((item) => item.id));
  });

  it("scores factor means with reverse keying and keeps the member's own note", () => {
    const form = generatePersonalityForm(7);
    const answers = Object.fromEntries(form.map((item) => [item.id, item.reverse ? 1 : 5]));
    const result = scorePersonalityForm(7, answers, "  I prefer objectivity but I do empathise.  ");
    expect(result.complete).toBe(true);
    expect(Object.values(result.factors).every((factor) => factor.score === 5 && factor.band === "higher")).toBe(true);
    expect(result.note).toBe("I prefer objectivity but I do empathise.");
    expect(scorePersonalityForm(7, {}).complete).toBe(false);
  });
});
