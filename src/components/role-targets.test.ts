import { describe, expect, it } from "vitest";
import { benchmarkNote } from "./role-targets";

describe("role benchmark note", () => {
  const postings = [{ employer: "Palantir", retrievedAt: "2026-10-22" }, { employer: "Anthropic", retrievedAt: "2026-10-22" }];
  it("states the sample size, employers, date and what is not recorded", () => {
    expect(benchmarkNote(postings, new Date("2026-11-03T00:00:00Z"))).toBe("A sample of 2 postings (Palantir, Anthropic) · retrieved 2026-10-22 · location, industry and seniority not recorded");
  });
  it("asks for a refresh once the postings are over a month old", () => {
    expect(benchmarkNote(postings, new Date("2026-12-01T00:00:00Z"))).toContain("40 days ago — refresh before relying on it");
  });
});
