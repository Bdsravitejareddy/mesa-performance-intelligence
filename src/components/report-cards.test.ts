import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportCards, type ReportCardRow } from "./report-cards";
import { FeedbackSummary } from "./feedback-summary";

// Invented results.
const card: ReportCardRow = {
  term: "Term 1", program: "PGP", overall_grade: "A-", gpa: 3.455, cgpa: 3.455, credits_earned: 22, credits_attempted: 22, attendance_pct: 96.5, fetched_at: "2026-11-17T06:49:00Z",
  courses: [
    { course: "Pricing with Prof. Example", credits: 2, grade: "B+", gpa: 3, percentage: 70, failed: false },
    { course: "Statistics Lab", credits: 4, grade: "A+", gpa: 4, percentage: 95, failed: false },
  ],
  breakdown: [{ course: "Pricing with Prof. Ex ample", printedTitle: "Pricing…", cumulative: 70, grade: "B+", computed: 70, agrees: true, components: [
    { name: "Mid Term", weightPct: 40, marks: 20, max: 40 }, { name: "Quiz", weightPct: 20, marks: 20, max: 20 }, { name: "End Term", weightPct: 40, marks: 30, max: 40 },
  ] }],
  out_class: [{ name: "BYOB (Build Your Own Business)", score: 8, outOf: 10, grade: "A-", credits: 10 }],
  breakdown_generated_on: "2026-11-16", breakdown_imported_at: "2026-11-17T06:50:00Z",
};

describe("report card at a glance", () => {
  it("leads with the term figures, ranks courses best first, and names where points were lost", () => {
    const html = renderToStaticMarkup(createElement(ReportCards, { cards: [card] }));
    expect(html).toContain("Term GPA"); expect(html).toContain("3.46"); expect(html).toContain("BYOB");
    expect(html.indexOf("Statistics Lab")).toBeLessThan(html.indexOf("Pricing"));
    // The short name drops the instructor; the breakdown is matched although the PDF split the name.
    expect(html).toContain("<strong>Pricing</strong>");
    expect(html).toContain("Lost most on Mid Term (−20), End Term (−10)");
    expect(html).toContain("Components not imported");
  });
});

describe("feedback summary", () => {
  it("separates what to work on from what went well, and keeps the AI grader apart", () => {
    const feedback = "Pitch 1\nWhat went well: A clear opening.\nNote: Look less rehearsed and make more eye contact.";
    const html = renderToStaticMarkup(createElement(FeedbackSummary, { feedback, source: "Mesa Feedback page", ai: { strengths: ["Well structured."], issues: ["No numbers support the claim."] } }));
    expect(html).toMatch(/To work on[\s\S]*Faculty · Mesa Feedback page[\s\S]*Look less rehearsed/);
    expect(html).toMatch(/Went well[\s\S]*A clear opening/);
    expect(html).toMatch(/AI grader[\s\S]*not official[\s\S]*No numbers support the claim/);
    expect(html).toContain("Original text");
  });
});
