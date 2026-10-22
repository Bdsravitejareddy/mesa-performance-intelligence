import { describe, expect, it } from "vitest";
import { codeGrade, keyTerms, stem, terms } from "./code-score";

const criteria = [
  { name: "Market sizing", description: "Estimate the total addressable market using customer segments and pricing assumptions.", weight: 2 },
  { name: "Recommendation", description: "Recommend a go-to-market channel with risks and mitigation.", weight: 1 },
];
const course = ["Market sizing starts from customer segments. Pricing assumptions drive revenue. Channels carry risks that need mitigation."];
const long = (text: string) => `${text} ${"Further discussion of the operating context follows. ".repeat(30)}`;

describe("code score", () => {
  it("stems word families together and drops rubric filler", () => {
    expect(stem("pricing")).toBe(stem("priced"));
    expect(terms("Clearly demonstrates appropriate pricing")).toEqual([stem("pricing")]);
    expect(keyTerms("market market segment", 1)).toEqual(["market"]);
  });

  it("is deterministic and rewards work that addresses each criterion", () => {
    const strong = long("We size the addressable market from three customer segments with explicit pricing assumptions. We recommend a direct channel and list the risks with a mitigation plan.");
    const weak = long("This essay talks about the company history and its founders.");
    const a = codeGrade(strong, criteria, course);
    expect(codeGrade(strong, criteria, course)).toEqual(a);
    expect(a.score).toBeGreaterThan(70);
    expect(codeGrade(weak, criteria, course).score).toBeLessThan(25);
    expect(a.report.criteria[0].matched).toContain("market");
  });

  it("caps very short work and deducts arithmetic errors, and says so", () => {
    const short = codeGrade("Market segments and pricing assumptions; channel risks and mitigation. 2 + 2 = 5", criteria, course);
    expect(short.score).toBeLessThanOrEqual(50);
    expect(short.report.arithmetic.errors).toHaveLength(1);
    expect(short.report.adjustments.join(" ")).toMatch(/capped at 50/);
  });

  it("returns no score rather than inventing one when nothing can be measured", () => {
    expect(codeGrade("", criteria, course).score).toBeNull();
    expect(codeGrade("Some work here", [{ name: "The", description: "and of", weight: 1 }], course).score).toBeNull();
  });
});
