import type { MesaAssignmentRecord } from "./normalize";

export function mergeAssignmentRecords(groups: MesaAssignmentRecord[][]): MesaAssignmentRecord[] {
  const records = new Map<string, MesaAssignmentRecord>();
  for (const group of groups) for (const record of group) {
    const current = records.get(record.assignmentId);
    if (!current) {
      records.set(record.assignmentId, record);
      continue;
    }
    const sourceMaximumMark = record.sourceMaximumMark ?? current.sourceMaximumMark;
    const sourceScore = record.sourceScore ?? current.sourceScore;
    const score = sourceScore !== null && sourceScore !== undefined && sourceMaximumMark && sourceMaximumMark > 0
      ? sourceScore <= sourceMaximumMark ? Math.round((sourceScore / sourceMaximumMark) * 10000) / 100 : null
      : record.score ?? current.score;
    records.set(record.assignmentId, {
      ...current,
      ...record,
      submissionId: record.submissionId || current.submissionId,
      courseId: record.courseId || current.courseId,
      courseTitle: record.courseTitle || current.courseTitle,
      maximumMark: sourceMaximumMark ?? record.maximumMark ?? current.maximumMark,
      sourceMaximumMark,
      sourceScore,
      score,
      feedback: record.feedback || current.feedback,
      status: record.status || current.status,
      submittedAt: record.submittedAt || current.submittedAt,
      sourceUpdatedAt: record.sourceUpdatedAt || current.sourceUpdatedAt,
    });
  }
  return [...records.values()];
}
