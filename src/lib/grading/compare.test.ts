import { describe, expect, it } from "vitest";
import { compareWithFeedback, splitPoints } from "./compare";

describe("feedback comparison", () => {
  it("splits faculty feedback into points", () => {
    expect(splitPoints("Good market sizing with clear segments. The recommendation lacks risk analysis.\n- Pricing assumptions need sources")).toHaveLength(3);
  });

  it("pairs points that share terms and keeps the rest apart without judging either side", () => {
    const result = compareWithFeedback({
      feedback: "The recommendation lacks a proper risk analysis for the channel. Formatting was excellent throughout the document.",
      aiPoints: ["Channel recommendation gives no risk analysis or mitigation", "Pricing assumptions are not sourced"],
      official: 70, ai: 62, code: 75,
    });
    expect(result.agreed).toHaveLength(1);
    expect(result.agreed[0].shared).toEqual(expect.arrayContaining(["risk", "analysis"]));
    expect(result.facultyOnly).toEqual(["Formatting was excellent throughout the document."]);
    expect(result.aiOnly).toEqual(["Pricing assumptions are not sourced"]);
    expect(result.gaps).toEqual({ aiMinusOfficial: -8, codeMinusOfficial: 5, aiMinusCode: -13 });
    expect(result.agreement).toBe("moderate");
    expect(result.note).toMatch(/not evidence that either is wrong/);
  });

  it("reports when there is no official mark to compare with", () => {
    expect(compareWithFeedback({ feedback: "", aiPoints: [], official: null, ai: 60, code: 55 }).agreement).toBe("no_official_mark");
  });
});
