import { describe, expect, it } from "vitest";
import { buildSwotSignals } from "./swot-signals";

describe("buildSwotSignals", () => {
  it("turns official marks into cautious, source-linked strengths and development signals", () => {
    const result = buildSwotSignals([
      { id: "m1", title: "Mid-Term Assignment", course: "The Art of Selling", mark: 92, feedback: "Clear customer focus", source: "Mesa LMS (Nexus MCP)" },
      { id: "m2", title: "Mid-Term Assessment", course: "Fundamentals of Finance", mark: 31.5, feedback: "Review the calculations and assumptions", source: "Mesa LMS (Nexus MCP)" },
      { id: "m3", title: "Mid-Term Assignment", course: "Data Driven Decision Making", mark: 60.17, feedback: "Several calculation steps need correction", source: "Mesa LMS (Nexus MCP)" },
    ]);

    expect(result.find((item) => item.category === "strength")).toMatchObject({ title: expect.stringContaining("The Art of Selling"), sourceIds: ["m1"] });
    expect(result.find((item) => item.category === "weakness")).toMatchObject({ title: expect.stringContaining("2"), sourceIds: ["m2", "m3"] });
    expect(result.find((item) => item.category === "opportunity")?.evidence).toContain("calculations and assumptions");
    expect(result.find((item) => item.category === "threat")?.evidence).toContain("This view draws on 3 valid official marks");
    expect(result.every((item) => item.reviewStatus === "suggested")).toBe(true);
  });

  it("does not infer a strength or weakness from invalid or missing marks", () => {
    const result = buildSwotSignals([
      { id: "m1", title: "Unknown", course: "Course", mark: 120, feedback: "", source: "LMS" },
      { id: "m2", title: "Pending", course: "Course", mark: null, feedback: "", source: "LMS" },
    ]);

    expect(result.filter((item) => item.category === "strength" || item.category === "weakness")).toEqual([]);
    expect(result.find((item) => item.category === "opportunity")?.evidence).toContain("No official feedback");
  });

  it("keeps feedback-only records for opportunity signals without treating them as mark evidence", () => {
    const result = buildSwotSignals([
      { id: "f1", title: "Feedback review", course: "Data Driven Decision Making", mark: null, feedback: "Show actual numbers for every sub-question", source: "Mesa LMS" },
    ]);

    expect(result.find((item) => item.category === "opportunity")).toMatchObject({ sourceIds: ["f1"], evidence: expect.stringContaining("actual numbers") });
    expect(result.find((item) => item.category === "threat")?.evidence).toContain("0 valid official marks");
  });
});
