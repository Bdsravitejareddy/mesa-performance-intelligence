import { describe, expect, it } from "vitest";
import { stakesOf } from "./stakes";

describe("assessment stakes", () => {
  it("reads term exams, graded work and practice from titles", () => {
    expect(["Entrepreneurship 101 Mid-Term Assignment", "End-Term Assessment", "Important: Final LinkedIn Profile Snapshot - Graded Submission", "Important: Business Reader - Assessment 1 Documents", "AI MRS 1", "Power of Communication - Written Assessment"].map((title) => stakesOf(title))).toEqual(Array(6).fill("exam"));
    expect(["Session 4 Meesho Async Assignment", "Session 2 Zomato Workbook", "Session 1_ Reflection in Class", "Week 1 Assignment", "Session 7 Practice Workbook", "Personal Branding Assessment - Template Submission"].map((title) => stakesOf(title))).toEqual(Array(6).fill("practice"));
    expect(["Quiz 1 Entrepreneurship 101", "Week 0 Quiz"].map((title) => stakesOf(title))).toEqual(["graded", "practice"]);
  });

  it("treats work marked as not counting toward the grade as practice, whatever its title", () => {
    expect(stakesOf("Mid-Term Assignment", false)).toBe("practice");
    expect(stakesOf("AI x Ops Hackathon", false)).toBe("practice");
    expect(stakesOf("Mid-Term Assignment", true)).toBe("exam");
  });
});
