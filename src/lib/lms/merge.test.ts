import { describe, expect, it } from "vitest";
import { normalizeAssignmentRecords } from "./normalize";
import { mergeAssignmentRecords } from "./merge";

describe("MCP assignment and grade joins", () => {
  it("joins grade evidence to assignment details when the grades endpoint supplies course context", () => {
    const assignments = normalizeAssignmentRecords({ assignments: [{ id: "assignment-1", title: "Case", course: "" }] });
    const grades = normalizeAssignmentRecords({ grades: [{ assignment: { id: "assignment-1", title: "Case", course: { id: "course-1", title: "Marketing" } }, grade: { score: 88, comments: "Good analysis." } }] });
    expect(mergeAssignmentRecords([assignments, grades])).toMatchObject([{
      assignmentId: "assignment-1", courseId: "course-1", courseTitle: "Marketing", score: 88, feedback: "Good analysis.",
    }]);
  });

  it("uses a maximum supplied by another endpoint when joining the same grade", () => {
    const score = normalizeAssignmentRecords({ grades: [{ assignment: { id: "assignment-2", title: "Finance Case" }, grade: { score: 30 } }] });
    const maximum = normalizeAssignmentRecords({ assignments: [{ id: "assignment-2", title: "Finance Case", max_marks: 40 }] });
    expect(mergeAssignmentRecords([score, maximum])).toMatchObject([{ score: 75, sourceScore: 30, sourceMaximumMark: 40 }]);
  });
});
