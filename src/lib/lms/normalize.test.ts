import { describe, expect, it } from "vitest";
import { assignmentRecordFieldPaths, normalizeAssignmentRecords, unwrapToolResult } from "./normalize";

describe("Mesa MCP assignment normalization", () => {
  it("keeps an explicit earned score on the 0–100 scale and preserves feedback", () => {
    const records = normalizeAssignmentRecords({ structuredContent: { assignments: [{ id: "a-1", title: "Mid-Term Assignment", course: { id: "c-1", title: "Art of Selling" }, max_marks: 100, submission: { id: "s-1", score: 92, feedback: "Strong application." } }] } });
    expect(records).toEqual([{ assignmentId: "a-1", submissionId: "s-1", courseId: "c-1", courseTitle: "Art of Selling", title: "Mid-Term Assignment", maximumMark: 100, score: 92, feedback: "Strong application.", status: "", submittedAt: null, sourceUpdatedAt: null }]);
  });

  it("does not treat maximum marks or a pending score label as a student score", () => {
    const records = normalizeAssignmentRecords({ assignments: [{ id: "a-2", title: "End Term", course_name: "Finance", max_marks: 0, status: "Pending" }] });
    expect(records[0]).toMatchObject({ title: "End Term", maximumMark: 100, score: null, feedback: "", status: "Pending" });
  });

  it("parses JSON text returned in an MCP content block", () => {
    expect(unwrapToolResult({ content: [{ type: "text", text: JSON.stringify({ assignments: [{ id: "a-3", title: "Case", score: 78 }] }) }] })).toEqual({ assignments: [{ id: "a-3", title: "Case", score: 78 }] });
  });

  it("maps a grade list with nested assignment and grade objects", () => {
    const records = normalizeAssignmentRecords({ structuredContent: { grades: [{ assignment: { id: "a-4", title: "Marketing Case", course: { id: "c-4", name: "Marketing" } }, grade: { score: "84/100", comments: "Clear analysis." } }] } });
    expect(records[0]).toMatchObject({ assignmentId: "a-4", courseTitle: "Marketing", title: "Marketing Case", score: 84, feedback: "Clear analysis." });
  });

  it("maps a scalar course title and treats opaque course IDs as IDs", () => {
    const records = normalizeAssignmentRecords({ assignments: [
      { id: "a-course-title", title: "Case", course: "Marketing Strategy" },
      { id: "a-course-id", title: "Case", course: "a1b2c3d4-e5f6-4789-8123-aabbccddeeff" },
    ] });
    expect(records[0]).toMatchObject({ courseId: "", courseTitle: "Marketing Strategy" });
    expect(records[1]).toMatchObject({ courseId: "a1b2c3d4-e5f6-4789-8123-aabbccddeeff", courseTitle: "" });
  });

  it("leaves non-JSON MCP text opaque rather than guessing a mark", () => {
    expect(unwrapToolResult({ content: [{ type: "text", text: "2 assignments · Case Study" }] })).toEqual({ content: [{ type: "text", text: "2 assignments · Case Study" }] });
    expect(normalizeAssignmentRecords({ content: [{ type: "text", text: "92/100" }] })).toEqual([]);
  });

  it("reports only field names for course-link diagnostics, never source values", () => {
    const fields = assignmentRecordFieldPaths({ assignments: [{ id: "private-id", course_ref: { id: "private-course-id", label: "Confidential title" } }] });
    expect(fields).toContain("course_ref.id");
    expect(fields).toContain("course_ref.label");
    expect(fields.join(" ")).not.toMatch(/private|Confidential/);
  });
});
