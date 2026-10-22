import { describe, expect, it } from "vitest";
import { generateReasoningTest, publicItems, scoreReasoning } from "./reasoning";

describe("reasoning test generator", () => {
  it("is deterministic per seed and different across seeds", () => {
    expect(generateReasoningTest(42)).toEqual(generateReasoningTest(42));
    expect(generateReasoningTest(42).map((item) => item.prompt)).not.toEqual(generateReasoningTest(43).map((item) => item.prompt));
  });

  it("produces 12 items, 4 per section, each with four distinct options and a valid answer", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const items = generateReasoningTest(seed);
      expect(items).toHaveLength(12);
      expect(items.filter((item) => item.section === "numerical")).toHaveLength(4);
      for (const item of items) {
        expect(new Set(item.options).size).toBe(4);
        expect(item.answer).toBeGreaterThanOrEqual(0);
        expect(item.answer).toBeLessThan(4);
      }
    }
  });

  it("never sends answers or explanations to the browser", () => {
    const shown = JSON.stringify(publicItems(generateReasoningTest(7)));
    expect(shown).not.toContain("answer");
    expect(shown).not.toContain("explanation");
  });

  it("scores exactly against the regenerated key", () => {
    const items = generateReasoningTest(99);
    const perfect = Object.fromEntries(items.map((item) => [item.id, item.answer]));
    expect(scoreReasoning(items, perfect).percent).toBe(100);
    const wrongNumerical = { ...perfect, [items[0].id]: (items[0].answer + 1) % 4 };
    const result = scoreReasoning(items, wrongNumerical);
    expect(result.sections.numerical).toEqual({ correct: 3, total: 4, percent: 75 });
    expect(result.correct).toBe(11);
  });

  it("computes break-even correctly", () => {
    const item = Array.from({ length: 200 }, (_, seed) => generateReasoningTest(seed + 1)).flat().find((entry) => entry.prompt.includes("break even"))!;
    const [price, cost] = [...item.prompt.matchAll(/₹(\d[\d,]*)/g)].map((match) => Number(match[1].replace(/,/g, "")));
    const fixed = Number(item.prompt.match(/Fixed costs are ₹([\d,]+)/)![1].replace(/,/g, ""));
    expect(item.options[item.answer].replace(/,/g, "")).toBe(String(Math.ceil(fixed / (price - cost))));
  });
});
