import { describe, expect, it } from "vitest";
import { buildWeek, expression, weekStart } from "./week";

describe("weekly practice", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart(new Date("2026-10-23T10:00:00Z"))).toBe("2026-10-19");
    expect(weekStart(new Date("2026-10-19T00:30:00Z"))).toBe("2026-10-19");
  });
  it("builds three quiz and two trick questions with computed keys, a case task and two prompts", () => {
    const { items, key } = buildWeek(42, "Execution");
    expect(items.filter((item) => item.kind === "quiz")).toHaveLength(3);
    expect(items.filter((item) => item.kind === "trick")).toHaveLength(2);
    expect(Object.keys(key)).toEqual(["q1", "q2", "q3", "t1", "t2"]);
    expect(items.find((item) => item.kind === "case")).toMatchObject({ focus: "Execution" });
    const prompts = items.filter((item) => item.kind === "conversation").map((item) => item.prompt);
    expect(new Set(prompts).size).toBe(2);
    expect(buildWeek(42, "Unknown skill").items.find((item) => item.kind === "case")).toMatchObject({ focus: "Analytical reasoning" });
  });
  it("describes written expression", () => {
    expect(expression("I walked home. The evening was quiet and beautiful.")).toMatchObject({ words: 9, avgSentence: 4.5, longWords: 1 });
  });
});
