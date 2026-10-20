import { describe, expect, it } from "vitest";
import { toAssessmentRow, toSubmissionRow } from "./records";
import type { MesaAssignmentRecord } from "./normalize";

const assignment: MesaAssignmentRecord = {
  assignmentId: "assignment-1", submissionId: "submission-1", courseId: "course-1", courseTitle: "Art of Selling",
  title: "Mid-Term Assignment", maximumMark: 100, score: 92, feedback: "Strong application.", status: "Released", submittedAt: null, sourceUpdatedAt: null,
};

describe("Mesa LMS database records", () => {
  it("records the source assignment and fixed 0–100 scale", () => {
    expect(toAssessmentRow(assignment, "user-1", "course-row-1")).toEqual({
      user_id: "user-1", course_id: "course-row-1", title: "Mid-Term Assignment", assessment_format: "written",
      official_max_mark: 100, source_record_id: "mesa-lms:assignment:assignment-1",
    });
  });

  it("stores only an explicit LMS score and never substitutes the assessment maximum", () => {
    expect(toSubmissionRow(assignment, "user-1", "assessment-row-1")).toMatchObject({
      user_id: "user-1", assessment_id: "assessment-row-1", source_record_id: "mesa-lms:submission:submission-1",
      official_mark: 92, official_feedback: "Strong application.", official_mark_source: "Mesa LMS (Nexus MCP)", lms_submission_status: "Released",
    });
    expect(toSubmissionRow({ ...assignment, score: null }, "user-1", "assessment-row-1").official_mark).toBeNull();
  });

});
