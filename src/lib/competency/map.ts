import { parseCriterionScores } from "@/lib/feedback/criteria";
import { stakesOf } from "@/lib/assessments/stakes";
import { classifyCompetency, type CompetencyAssessment, type CompetencyEvidence } from "./classify";

export type CompetencyRow = { id: string; domain_key: string; domain_name: string; name: string; description: string; sort_order: number };
export type MappingRow = { assessment_id: string; competency_id: string; mapping_source: CompetencyEvidence["mappingSource"]; review_status: string; criterion_label?: string | null };
export type AssessmentRow = { id: string; course_id: string; title: string };
export type SubmissionRow = { id: string; assessment_id: string; official_mark: number | string | null; official_feedback: string | null; official_mark_source: string | null; submitted_at: string | null; source_updated_at?: string | null };
export type CourseRow = { id: string; title: string };

export type CompetencyMapEntry = CompetencyRow & { assessment: CompetencyAssessment; mappedAssessments: number };
export type CompetencyDomain = { key: string; name: string; competencies: CompetencyMapEntry[] };

export type TestEvidence = { id: string; submitted_at: string; result: { sections?: Record<string, { correct: number; total: number; percent: number }> } };

export function buildCompetencyMap(input: { competencies: CompetencyRow[]; mappings: MappingRow[]; assessments: AssessmentRow[]; submissions: SubmissionRow[]; courses: CourseRow[]; tests?: TestEvidence[]; gradings?: { assessment_id: string; ai_score: number | string | null; created_at: string; ai_report?: { summary?: string } | null }[]; rubric?: { bands: { high: number; low: number } } }, now: Date = new Date()): CompetencyDomain[] {
  // The latest blind AI grade per assessment (inputs arrive newest first).
  const aiGrade = new Map<string, { score: number; date: string; summary: string }>();
  for (const row of input.gradings ?? []) if (row.ai_score !== null && !aiGrade.has(row.assessment_id)) aiGrade.set(row.assessment_id, { score: Number(row.ai_score), date: row.created_at, summary: String(row.ai_report?.summary ?? "").slice(0, 280) });
  const assessmentById = new Map(input.assessments.map((row) => [row.id, row]));
  const courseById = new Map(input.courses.map((row) => [row.id, row.title]));
  const submissionsByAssessment = new Map<string, SubmissionRow[]>();
  for (const row of input.submissions) submissionsByAssessment.set(row.assessment_id, [...(submissionsByAssessment.get(row.assessment_id) ?? []), row]);

  const evidenceByCompetency = new Map<string, CompetencyEvidence[]>();
  const mappedCount = new Map<string, number>();
  for (const mapping of input.mappings) {
    // Only reviewed mappings are evidence; suggested or rejected AI tags never count.
    if (mapping.review_status !== "accepted") continue;
    const assessment = assessmentById.get(mapping.assessment_id);
    if (!assessment) continue;
    mappedCount.set(mapping.competency_id, (mappedCount.get(mapping.competency_id) ?? 0) + 1);
    const base = { assessmentId: assessment.id, assessmentTitle: assessment.title, course: courseById.get(assessment.course_id) ?? "Course", mappingSource: mapping.mapping_source, granularity: "whole_assessment" as const, stakes: stakesOf(assessment.title) };
    const submissions = submissionsByAssessment.get(assessment.id) ?? [];
    const items: CompetencyEvidence[] = !submissions.length
      ? [{ ...base, submissionId: null, mark: null, feedback: "", date: null, source: "No submission recorded", ...(mapping.criterion_label ? { granularity: "criterion" as const, criterionLabel: mapping.criterion_label, assessmentTitle: `${assessment.title} · ${mapping.criterion_label}` } : {}) }]
      : submissions.map((row) => {
        const common = { ...base, submissionId: row.id, feedback: row.official_feedback ?? "", date: row.source_updated_at ?? row.submitted_at, source: row.official_mark_source || "Manual entry" };
        if (!mapping.criterion_label) return { ...common, mark: row.official_mark === null ? null : Number(row.official_mark) };
        // Criterion marks come only from the official feedback text; a missing criterion is unscored, never zero.
        const criterion = parseCriterionScores(row.official_feedback ?? "").find((item) => item.label.toLowerCase() === mapping.criterion_label!.toLowerCase());
        return { ...common, granularity: "criterion" as const, criterionLabel: mapping.criterion_label, assessmentTitle: `${assessment.title} · ${mapping.criterion_label}`, mark: criterion ? criterion.percent : null, source: criterion ? `${common.source} · criterion ${criterion.score}/${criterion.max} in official feedback` : `${common.source} · criterion not found in feedback` };
      });
    // No official mark on this assessment: its blind AI grade counts instead, labelled and at lower confidence.
    const grade = aiGrade.get(assessment.id);
    const officiallyMarked = items.some((item) => item.mark !== null);
    const withAi: CompetencyEvidence[] = !officiallyMarked && grade && !mapping.criterion_label
      ? [{ ...base, submissionId: submissions[0]?.id ?? null, mark: Math.round(grade.score * 10) / 10, feedback: submissions[0]?.official_feedback ?? "", date: grade.date, source: "Blind AI grade against the brief — not an official mark", evidenceKind: "ai_grade", excerpt: grade.summary }]
      : items;
    evidenceByCompetency.set(mapping.competency_id, [...(evidenceByCompetency.get(mapping.competency_id) ?? []), ...withAi]);
  }

  // Reasoning practice tests: numerical section → numerical analysis; logical and verbal → logical reasoning.
  for (const test of input.tests ?? []) {
    const sections = test.result.sections ?? {};
    const add = (competencyId: string, label: string, parts: string[]) => {
      const correct = parts.reduce((sum, part) => sum + (sections[part]?.correct ?? 0), 0);
      const total = parts.reduce((sum, part) => sum + (sections[part]?.total ?? 0), 0);
      if (!total) return;
      const row: CompetencyEvidence = { submissionId: test.id, assessmentId: `test:${test.id}:${competencyId}`, assessmentTitle: `Reasoning test · ${label}`, course: "Practice tests", mark: Math.round((correct / total) * 100), feedback: "", date: test.submitted_at, source: `Practice reasoning test (${correct}/${total})`, mappingSource: "practice_test", granularity: "whole_assessment", stakes: "practice" };
      evidenceByCompetency.set(competencyId, [...(evidenceByCompetency.get(competencyId) ?? []), row]);
      mappedCount.set(competencyId, (mappedCount.get(competencyId) ?? 0) + 1);
    };
    add("analytical.numerical_analysis", "numerical", ["numerical"]);
    add("analytical.logical_reasoning", "logical and verbal", ["logical", "verbal"]);
  }

  const domains = new Map<string, CompetencyDomain>();
  for (const competency of [...input.competencies].sort((a, b) => a.sort_order - b.sort_order)) {
    const domain = domains.get(competency.domain_key) ?? { key: competency.domain_key, name: competency.domain_name, competencies: [] };
    domain.competencies.push({ ...competency, assessment: classifyCompetency(evidenceByCompetency.get(competency.id) ?? [], now, input.rubric?.bands), mappedAssessments: mappedCount.get(competency.id) ?? 0 });
    domains.set(competency.domain_key, domain);
  }
  return [...domains.values()];
}
