import { describe, expect, it } from "vitest";
import { createEvaluationInputHash, type EvaluationCacheInput } from "./evaluation-input";

const input: EvaluationCacheInput = {
  assessment: { id: "a1", courseId: "c1", title: "Mid term", format: "case analysis" },
  submissionText: "Student answer",
  documents: [{ id: "d1", name: "answer.pdf", sourceKind: "upload", version: "v1", text: "Extracted answer" }],
  officialMark: 80,
  officialFeedback: "Good use of evidence",
  officialMarkSource: "Mesa LMS",
  sourceOriginalMark: 16,
  sourceOriginalMaximum: 20,
  rubric: { id: "r1", source: "official", maximumMarks: 100, criteria: [{ title: "Analysis", weight: 100, maximumMarks: 100, sourceReference: "rubric p.1" }] },
  roleProfile: { id: "role1", title: "Senior TPM", competencies: ["clinical safety"] },
  courseReferences: [{ key: "S1", pageId: "p1", materialId: "m1", label: "Notes v1 p.2", excerpt: "Framework" }],
  arithmeticChecks: [{ expression: "2+2", valid: true }],
};

describe("evaluation cache input hash", () => {
  it("changes when any submission, official, rubric, role, course-source, or deterministic evidence changes", () => {
    const base = createEvaluationInputHash(input);
    const variants: EvaluationCacheInput[] = [
      { ...input, submissionText: "Changed answer" },
      { ...input, assessment: { ...input.assessment, format: "written exam" } },
      { ...input, documents: [{ ...input.documents[0], version: "v2" }] },
      { ...input, documents: [{ ...input.documents[0], text: "Changed extracted text" }] },
      { ...input, officialMark: 81 },
      { ...input, sourceOriginalMaximum: 40 },
      { ...input, officialFeedback: "Different feedback" },
      { ...input, rubric: { ...input.rubric, criteria: [{ ...input.rubric.criteria[0], weight: 90 }] } },
      { ...input, roleProfile: { ...input.roleProfile!, competencies: ["different role expectation"] } },
      { ...input, courseReferences: [{ ...input.courseReferences[0], excerpt: "Changed course page" }] },
      { ...input, arithmeticChecks: [{ expression: "2+2", valid: false }] },
    ];
    for (const variant of variants) expect(createEvaluationInputHash(variant)).not.toBe(base);
  });
});
