import type { MesaAssignmentRecord } from "./normalize";

export function mergeAssignmentRecords(groups: MesaAssignmentRecord[][]): MesaAssignmentRecord[] {
  const records = new Map<string, MesaAssignmentRecord>();
  for (const group of groups) for (const record of group) {
    const current = records.get(record.assignmentId);
    records.set(record.assignmentId, current ? {
      ...current,
      ...record,
      submissionId: record.submissionId || current.submissionId,
      courseId: record.courseId || current.courseId,
      courseTitle: record.courseTitle || current.courseTitle,
      score: record.score ?? current.score,
      feedback: record.feedback || current.feedback,
      status: record.status || current.status,
      submittedAt: record.submittedAt || current.submittedAt,
      sourceUpdatedAt: record.sourceUpdatedAt || current.sourceUpdatedAt,
    } : record);
  }
  return [...records.values()];
}
