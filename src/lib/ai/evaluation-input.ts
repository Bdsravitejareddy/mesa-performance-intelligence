import { createHash } from "node:crypto";

export type EvaluationCacheInput = {
  assessment: { id: string; courseId: string; title: string; format: string };
  submissionText: string;
  documents: { id: string; name: string; sourceKind: string; version: string; text: string }[];
  officialMark: number | null;
  officialFeedback: string;
  officialMarkSource: string;
  sourceOriginalMark: number | null;
  sourceOriginalMaximum: number | null;
  rubric: { id: string; source: string; maximumMarks: number; criteria: Record<string, unknown>[] };
  roleProfile: unknown;
  courseReferences: { key: string; pageId: string; materialId: string; label: string; excerpt: string }[];
  arithmeticChecks: unknown;
};

export function createEvaluationInputHash(input: EvaluationCacheInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
