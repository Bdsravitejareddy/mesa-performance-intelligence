import type { MesaAssignmentRecord } from "./normalize";

export function toAssessmentRow(record: MesaAssignmentRecord, userId: string, courseRowId: string) {
  return {
    user_id: userId,
    course_id: courseRowId,
    title: record.title,
    assessment_format: "written",
    official_max_mark: 100,
    source_max_mark: record.sourceMaximumMark,
    source_record_id: `mesa-lms:assignment:${record.assignmentId}`,
  };
}

export function toSubmissionRow(record: MesaAssignmentRecord, userId: string, assessmentRowId: string) {
  return {
    user_id: userId,
    assessment_id: assessmentRowId,
    answer_text: "",
    official_mark: record.score,
    source_original_mark: record.sourceScore,
    source_original_max_mark: record.sourceMaximumMark,
    official_feedback: record.feedback,
    official_mark_source: "Mesa LMS (Nexus MCP)",
    submitted_at: record.submittedAt,
    source_record_id: `mesa-lms:submission:${record.submissionId || record.assignmentId}`,
    lms_submission_status: record.status,
    source_updated_at: record.sourceUpdatedAt,
  };
}

