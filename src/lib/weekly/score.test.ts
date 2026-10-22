import { describe, expect, it } from "vitest";
import { progress, shiftWeek, weekStart } from "./score";

describe("weekly plan scoring", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart(new Date("2026-10-22T20:00:00Z"))).toBe("2026-10-19");
    expect(weekStart(new Date("2026-10-19T00:00:00Z"))).toBe("2026-10-19");
    expect(shiftWeek("2026-10-19", -1)).toBe("2026-10-12");
  });
  it("awards points, a perfect-week bonus and a streak of strong weeks", () => {
    const result = progress([{ week: "2026-10-19", done: 2, total: 5 }, { week: "2026-10-12", done: 5, total: 5 }, { week: "2026-10-05", done: 4, total: 5 }, { week: "2026-09-28", done: 1, total: 5 }], "2026-10-19");
    expect(result.points).toBe(2 * 10 + 5 * 10 + 25 + 4 * 10 + 10);
    expect(result.streak).toBe(2);
    expect(result.level).toBe(2);
  });
});
