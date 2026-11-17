import { describe, expect, it } from "vitest";
import { courseSummary, groupDuplicates, maxLabel } from "./summary";

describe("course at a glance", () => {
  const assessments = [
    { id: "a", title: "Mid-term written assessment", due_at: "2026-10-01" },
    { id: "b", title: "Graded submission: pricing case", due_at: "2026-10-20" },
    { id: "c", title: "Week 3 workbook", due_at: "2026-10-05" },
    { id: "d", title: "Session 4 practice", due_at: "2026-10-06" },
    { id: "e", title: "End-term project", due_at: "2026-12-01" },
    { id: "f", title: "Group presentation", due_at: "2026-11-01" },
  ];
  const marks = new Map([["a", 82], ["b", 54], ["c", 95]]);
  const now = new Date("2026-11-17");

  it("counts practice apart, never as graded work, and names the strongest and weakest released marks", () => {
    const summary = courseSummary({ title: "Pricing with Prof. A", cards: [], assessments, marks, now });
    expect(summary).toMatchObject({ graded: 4, practice: 2, released: 2, upcoming: 1, awaiting: 1, official: null, basis: "assessment_marks" });
    expect(summary.strongest?.name).toBe("Mid-term written assessment");
    expect(summary.weakest).toEqual({ name: "Graded submission: pricing case", detail: "54 out of 100" });
    expect(summary.next?.title).toBe("End-term project");
  });

  it("reads the report-card result, matching course names without spaces, and prefers its components", () => {
    const cards = [{ term: "Term 1", courses: [{ course: "Pricing  with Prof.A", percentage: 71.5, grade: "B+", credits: 3 }], breakdown: [{ course: "PricingwithProf. A", components: [{ name: "Quiz", weightPct: 20, marks: 18, max: 20 }, { name: "Project", weightPct: 40, marks: 20, max: 40 }] }] }];
    const summary = courseSummary({ title: "Pricing with Prof. A", cards, assessments, marks, now });
    expect(summary.official).toEqual({ term: "Term 1", percentage: 71.5, grade: "B+", credits: 3 });
    expect(summary.basis).toBe("report_card");
    expect(summary.strongest?.name).toBe("Quiz");
    expect(summary.weakest?.detail).toBe("20/40, 40% of the course");
  });

  it("labels a maximum as a maximum, never a bare 100/100", () => {
    expect(maxLabel(100)).toBe("out of 100");
    expect(maxLabel("100", 80)).toBe("out of 100 (marked out of 80)");
    expect(maxLabel(null)).not.toMatch(/100\/100/);
  });

  it("folds copies such as “ (1)” into one material", () => {
    const groups = groupDuplicates([{ name: "PreRead_Session 2_Zomato.pdf" }, { name: "PreRead_Session 2_Zomato (1).pdf" }, { name: "Session 3.pdf" }]);
    expect(groups).toHaveLength(2);
    expect(groups[0].copies.map((copy) => copy.name)).toEqual(["PreRead_Session 2_Zomato (1).pdf"]);
  });
});
