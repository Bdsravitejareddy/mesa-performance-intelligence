import { describe, expect, it } from "vitest";
import { classify, findConflicts, pointsFrom, rankPoints, splitPoints, tag } from "./repository";

const stored = [
  "Mesa Feedback page — Term 1, MRS 2 · Communication: 14.87/20 (read 2026-11-05).",
  "",
  "Pitch 1 6.17/8.57",
  "Written assessment 2.1/2.86",
  "",
  "Written Assessment",
  "What went well: Your opening apology and appreciation are sincere, and the numbered list makes your points easy to follow.",
  "What to improve: However, the reasons are brief.",
  "Next step: Say clearly that the software decision sits with IT.",
  "Note: \"Dear Grace\" suits better than \"Hi\", and propose a specific time to meet.",
].join("\n");

const assessments = new Map([["a1", { title: "MRS 2 · Communication", courseId: "c1" }], ["a2", { title: "Business Reader essay", courseId: "c2" }]]);
const courses = new Map([["c1", "Power of Communication"], ["c2", "Business Reader"]]);
const submissions = [
  { id: "s1", assessment_id: "a1", official_feedback: stored, official_mark_source: "Mesa Feedback page", source_updated_at: "2026-11-05T00:00:00Z", created_at: "2026-11-05T00:00:00Z" },
  { id: "s2", assessment_id: "a2", official_feedback: "Strong argument overall. The essay is too long; be more concise in the summary.", official_mark_source: "Mesa LMS (Nexus MCP)", source_updated_at: null, created_at: "2026-10-20T00:00:00Z" },
];
const gradings = [{ submission_id: "s1", assessment_id: "a1", ai_status: "graded", created_at: "2026-11-05T01:00:00Z", ai_report: { strengths: ["The reasons given are clear and well developed throughout."], issues: ["Sign-off is informal for a manager."] } }];

describe("feedback repository", () => {
  const points = pointsFrom(submissions, gradings, assessments, courses);

  it("splits stored feedback into points and skips the source line and criterion marks", () => {
    const lines = splitPoints(stored);
    expect(lines.some((line) => line.startsWith("Mesa Feedback page"))).toBe(false);
    expect(lines.some((line) => /6\.17\/8\.57/.test(line))).toBe(false);
    expect(lines).toHaveLength(4);
  });

  it("reads labelled polarity and treats a corrective cue as something to improve", () => {
    expect(classify("What went well: A decent opening, a strong ending.")).toEqual({ text: "A decent opening, a strong ending.", polarity: "strength" });
    expect(classify("Correct answer, but the cell is not formatted as currency.").polarity).toBe("improve");
    expect(tag("However, the reasons are brief.")).toEqual({ themes: ["reasoning", "clarity"], direction: "more_detail" });
  });

  it("labels faculty and AI grader points separately", () => {
    expect(points.filter((point) => point.source === "mesa_feedback_page").every((point) => point.authority === "faculty")).toBe(true);
    expect(points.filter((point) => point.source === "ai_grader")).toHaveLength(2);
  });

  it("reports opposite advice and faculty-versus-AI disagreement instead of averaging them", () => {
    const conflicts = findConflicts(points);
    const opposite = conflicts.find((conflict) => conflict.kind === "opposite_advice");
    expect(opposite?.theme).toBe("clarity");
    expect(opposite?.summary).toMatch(/more detail.*more concise|more concise.*more detail/);
    const disagreement = conflicts.find((conflict) => conflict.kind === "faculty_vs_ai");
    expect(disagreement?.points[0].authority).toBe("faculty");
    expect(disagreement?.summary).toMatch(/faculty's view is the official one/);
  });

  it("ranks the most relevant open faculty points first and says why", () => {
    const ranked = rankPoints(points, { courseId: "c1", competencyIds: ["communication.clarity"], text: "written reasons" });
    expect(ranked[0].authority).toBe("faculty");
    expect(ranked[0].why).toEqual(expect.arrayContaining(["matches the skill", "same course", "from faculty"]));
    const addressed = rankPoints(points.map((point) => ({ ...point, addressedAt: "2026-11-05" })), { courseId: "c1", openOnly: true });
    expect(addressed).toHaveLength(0);
  });
});
