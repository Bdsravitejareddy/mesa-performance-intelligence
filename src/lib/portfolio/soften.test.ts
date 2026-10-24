import { describe, expect, it } from "vitest";
import { soften } from "./soften";

describe("softened project claims", () => {
  it("rewrites verification claims to what documentation supports", () => {
    expect(soften("The codebase structure reflects a complete end-to-end implementation for the case study.")).toBe("The codebase structure reflects an apparently complete end-to-end implementation (from the structure; not run) for the case study.");
    expect(soften("Rigorous, well-documented data ethics")).toBe("Detailed, well-documented data ethics");
    expect(soften("It has rigorous evaluation suites and is verified.")).toBe("It has documented evaluation setup and is described.");
  });
});

describe("softening is idempotent", () => {
  it("leaves already softened text unchanged", () => {
    const once = soften("It is a complete end-to-end implementation and production-ready, with rigorous testing suites.");
    expect(soften(once)).toBe(once);
  });
});
