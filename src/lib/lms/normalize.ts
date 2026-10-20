type JsonObject = Record<string, unknown>;

export type MesaAssignmentRecord = {
  assignmentId: string;
  submissionId: string;
  courseId: string;
  courseTitle: string;
  title: string;
  maximumMark: number;
  score: number | null;
  feedback: string;
  status: string;
  submittedAt: string | null;
  sourceUpdatedAt: string | null;
};

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  for (const value of values) if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  const fraction = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fraction) return Number(fraction[2]) === 100 ? Number(fraction[1]) : null;
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function pickNumber(record: JsonObject, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberValue(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function timestamp(...values: unknown[]): string | null {
  const value = values.find((item) => typeof item === "string" && item.trim());
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function extractRecords(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.map(object).filter((item): item is JsonObject => !!item);
  const root = object(value);
  if (!root) return [];
  for (const key of ["assignments", "assessments", "grades", "items", "results", "data", "records"]) {
    if (Array.isArray(root[key])) return extractRecords(root[key]);
  }
  for (const value of Object.values(root)) {
    const found = extractRecords(value);
    if (found.length) return found;
  }
  return [];
}

export function unwrapToolResult(value: unknown): unknown {
  const root = object(value);
  if (!root) return value;
  if (object(root.structuredContent)) return root.structuredContent;
  if (root.result && object(root.result) && object((root.result as JsonObject).structuredContent)) return (root.result as JsonObject).structuredContent;
  const blocks = Array.isArray(root.content) ? root.content : object(root.result) && Array.isArray((root.result as JsonObject).content) ? (root.result as JsonObject).content as unknown[] : [];
  for (const block of blocks) {
    const text = object(block)?.text;
    if (typeof text !== "string") continue;
    try { return JSON.parse(text) as unknown; } catch { /* Keep plain-language tool output opaque. */ }
  }
  return value;
}

export function normalizeAssignmentRecords(value: unknown): MesaAssignmentRecord[] {
  const payload = unwrapToolResult(value);
  return extractRecords(payload).flatMap((record) => {
    const assignment = object(record.assignment) ?? object(record.assessment) ?? {};
    const course = object(record.course) ?? object(record.course_details) ?? object(record.courseDetails) ?? object(assignment.course) ?? {};
    const rawSubmission = object(record.submission) ?? object(record.my_submission) ?? object(record.mySubmission) ?? (Array.isArray(record.submissions) ? object(record.submissions[0]) : null) ?? {};
    const grade = object(record.grade) ?? {};
    const assignmentId = firstString(record.assignment_id, record.assignmentId, assignment.id, assignment.assignment_id, assignment.assessment_id, record.id, record._id);
    const title = firstString(record.assignment_title, record.assignmentTitle, record.assignment_name, assignment.title, assignment.name, record.title, record.name);
    if (!assignmentId || !title) return [];
    const score = pickNumber(rawSubmission, ["score", "earned_score", "earned_marks", "marks_obtained", "obtained_marks", "marks_awarded", "grade_score"])
      ?? pickNumber(grade, ["score", "earned_score", "earned_marks", "marks_obtained", "obtained_marks", "marks_awarded", "grade_score"])
      ?? pickNumber(record, ["score", "earned_score", "earned_marks", "marks_obtained", "obtained_marks", "marks_awarded", "grade_score"]);
    const maximumMark = pickNumber(record, ["max_marks", "maximum_marks", "maxMarks", "maximumMarks", "points_possible", "max_score"])
      ?? pickNumber(assignment, ["max_marks", "maximum_marks", "maxMarks", "maximumMarks", "points_possible", "max_score"]);
    const feedback = firstString(rawSubmission.feedback, rawSubmission.feedback_text, rawSubmission.comments, rawSubmission.evaluator_feedback, grade.feedback, grade.comments, record.feedback, record.feedback_text, record.evaluator_feedback);
    return [{
      assignmentId,
      submissionId: firstString(rawSubmission.id, rawSubmission.submission_id, rawSubmission.submissionId, rawSubmission._id),
      courseId: firstString(record.course_id, record.courseId, assignment.course_id, course.id, course.course_id),
      courseTitle: firstString(record.course_title, record.courseTitle, record.course_name, assignment.course_title, course.title, course.name),
      title,
      maximumMark: maximumMark !== null && maximumMark > 0 ? maximumMark : 100,
      score: score !== null && score >= 0 && score <= 100 ? score : null,
      feedback,
      status: firstString(rawSubmission.status, record.status, record.submission_status),
      submittedAt: timestamp(rawSubmission.submitted_at, rawSubmission.submittedAt, rawSubmission.submitted_on),
      sourceUpdatedAt: timestamp(rawSubmission.updated_at, rawSubmission.updatedAt, record.updated_at, record.updatedAt),
    }];
  });
}
