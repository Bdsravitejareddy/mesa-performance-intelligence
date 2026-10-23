import { describe, expect, it } from "vitest";
import { JOKES, jokeOfTheDay } from "./jokes";

describe("joke of the day", () => {
  it("is stable within a day and changes between days", () => {
    const morning = new Date("2026-10-23T03:00:00Z"), evening = new Date("2026-10-23T17:00:00Z"), next = new Date("2026-10-24T03:00:00Z");
    expect(jokeOfTheDay(morning)).toBe(jokeOfTheDay(evening));
    expect(jokeOfTheDay(next)).not.toBe(jokeOfTheDay(morning));
    expect(new Set(JOKES).size).toBe(JOKES.length);
  });
});
