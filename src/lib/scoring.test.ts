import { describe, expect, it } from "vitest";
import { formatOfficialMark, isValidOfficialMark, verifyArithmeticStatements } from "./scoring";

describe("official mark validation", () => {
  it("accepts only finite marks within the confirmed 0–100 grading scale", () => {
    expect(isValidOfficialMark(0)).toBe(true);
    expect(isValidOfficialMark(84)).toBe(true);
    expect(isValidOfficialMark(100)).toBe(true);
    expect(isValidOfficialMark(-0.01)).toBe(false);
    expect(isValidOfficialMark(100.01)).toBe(false);
    expect(isValidOfficialMark(Number.NaN)).toBe(false);
    expect(isValidOfficialMark(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("formats the source mark directly on the 100-point scale", () => {
    expect(formatOfficialMark(84)).toBe("84/100");
  });
});

describe("deterministic arithmetic checks", () => {
  it("identifies a correct arithmetic statement", () => {
    expect(verifyArithmeticStatements("Revenue increased by 42 + 18 = 60 units.")).toEqual([
      {
        expression: "42 + 18",
        computed: 60,
        reported: 60,
        status: "correct",
      },
    ]);
  });

  it("flags an arithmetic mismatch without inferring whether the method is correct", () => {
    expect(verifyArithmeticStatements("Contribution = 42 + 18 = 59")).toEqual([
      {
        expression: "42 + 18",
        computed: 60,
        reported: 59,
        status: "arithmetic_error",
      },
    ]);
  });

  it("reports no verified calculation when the answer has no supported equation", () => {
    expect(verifyArithmeticStatements("The calculation depends on the market assumption.")).toEqual([]);
  });
});
