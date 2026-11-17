import { describe, expect, it } from "vitest";
import { tag, type StoredPoint } from "./repository";
import { groupPoints, plain, pointsInTerm, rankGroups, recurringThemes, samepoint } from "./themes";

// Invented feedback points.
let next = 0;
const point = (text: string, extra: Partial<StoredPoint> = {}): StoredPoint => ({
  id: `p${(next += 1)}`, key: `k${next}`, source: "lms", authority: "faculty", submissionId: "s1", assessmentId: "a1", courseId: "c1",
  assessmentTitle: "Mid-Term Assignment", courseTitle: "Data Analysis", text, polarity: "improve", themes: [], direction: null, givenOn: "2026-10-21", addressedAt: null, ...extra,
});

describe("feedback themes", () => {
  it("treats the same comment from two sources as one row that names both", () => {
    const groups = groupPoints([
      point("You added extra sheets despite the instruction to use one sheet."),
      point("You added extra sheets despite the instruction to use one sheet", { source: "mesa_feedback_page", assessmentTitle: "MRS 1 · Data" }),
      point("The chart has no axis titles."),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].points).toHaveLength(2);
    expect(groups[0].where).toEqual(["Mid-Term Assignment", "MRS 1 · Data · Mesa Feedback page"]);
    expect(samepoint("Comparing a boolean column to = TRUE adds unnecessary verbosity.", "Comparing the boolean column to = TRUE adds verbosity")).toBe(true);
    expect(samepoint("Comparing a boolean column to = TRUE adds unnecessary verbosity.", "The chart has no axis titles.")).toBe(false);
  });

  it("keeps a faculty point leading when the AI grader repeats it, and ranks open, faculty and recurring first", () => {
    const groups = groupPoints([
      point("Added extra sheets despite instructions.", { source: "ai_grader", authority: "ai" }),
      point("You added extra sheets despite instructions."),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].faculty && groups[0].ai).toBe(true);
    expect(groups[0].text).toBe("You added extra sheets despite instructions.");
    const ranked = rankGroups(groupPoints([
      point("Old point, already fixed in the brief.", { addressedAt: "2026-11-01" }),
      point("An AI grader point about missing growth rates.", { authority: "ai", source: "ai_grader" }),
      point("Faculty: show the growth rates computed from the data."),
    ]));
    expect(ranked.map((group) => group.text)).toEqual(["Faculty: show the growth rates computed from the data.", "An AI grader point about missing growth rates.", "Old point, already fixed in the brief."]);
  });

  it("finds the recurring themes across courses, counts each distinct point once and quotes faculty first", () => {
    expect(tag("You added extra sheets despite the instruction.").themes[0]).toBe("instructions");
    expect(tag("Comparing a boolean column to = TRUE adds unnecessary verbosity.").themes[0]).toBe("code");
    const rows = [
      point("You added extra sheets despite the instruction to use one sheet."),
      point("Extra tabs were added although the brief asked for a single sheet.", { courseId: "c2", courseTitle: "Finance" }),
      point("Answer in the template as instructed, not in a new file.", { authority: "ai", source: "ai_grader" }),
      point("Comparing a boolean column to = TRUE adds unnecessary verbosity."),
      point("Use a JOIN instead of a subquery here."),
      point("The colours are lovely."),
    ];
    const groups = ["Data Analysis", "Finance"].flatMap((course) => groupPoints(rows.filter((row) => row.courseTitle === course)).map((group) => ({ ...group, course })));
    const themes = recurringThemes(groups);
    expect(themes[0]).toMatchObject({ id: "instructions", name: "Following the task instructions", count: 3, faculty: 2, aiOnly: 1, open: 3, courses: ["Data Analysis", "Finance"] });
    expect(themes[0].quotes[0].who).toBe("faculty");
    expect(themes[0].quotes).toHaveLength(2);
    expect(themes[1]).toMatchObject({ id: "code", count: 2 });
    // A single point is not a recurring theme.
    expect(themes.some((theme) => theme.name.includes("colours"))).toBe(false);
  });

  it("applies the header term filter by course and leaves everything under All", () => {
    const rows = [point("Term 1 point here.", { courseId: "t1" }), point("Term 2 point here.", { courseId: "t2" }), point("A point with no course.", { courseId: null })];
    const terms = new Map<string, string | null>([["t1", "Term 1"], ["t2", "Term 2"]]);
    expect(pointsInTerm(rows, terms, "Term 2").map((row) => row.text)).toEqual(["Term 2 point here."]);
    expect(pointsInTerm(rows, terms, "all")).toHaveLength(3);
  });

  it("rewrites importer wording plainly", () => {
    expect(plain("Your conclusion (cut off on the page)")).toBe("Your conclusion (the rest of this comment was not shown on the Feedback page)");
    expect(plain("Status not_submitted")).toBe("Status not submitted");
  });
});
