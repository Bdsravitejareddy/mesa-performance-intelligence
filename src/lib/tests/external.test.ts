import { describe, expect, it } from "vitest";
import { CLIFTON_THEMES, cliftonDomains, parseClifton, parseSixteenP, sixteenPToBigFive } from "./external";

describe("other personality tools", () => {
  it("reads a 16Personalities type and maps its aspects onto the Big Five", () => {
    const result = parseSixteenP("intj-a", { mind: 70 })!;
    expect(result.type).toBe("INTJ-A");
    expect(sixteenPToBigFive(result)).toEqual({ extraversion: 2.2, intellect: 4, agreeableness: 2, conscientiousness: 4, neuroticism: 2 });
    expect(parseSixteenP("XYZW")).toBeNull();
  });
  it("keeps only real CliftonStrengths themes and groups them by domain", () => {
    expect(CLIFTON_THEMES).toHaveLength(34);
    const themes = parseClifton(["strategic", "Learner", "Made up", "Achiever"]);
    expect(themes).toEqual(["Strategic", "Learner", "Achiever"]);
    expect(cliftonDomains(themes)).toEqual([{ domain: "Executing", themes: ["Achiever"] }, { domain: "Strategic Thinking", themes: ["Strategic", "Learner"] }]);
  });
});
