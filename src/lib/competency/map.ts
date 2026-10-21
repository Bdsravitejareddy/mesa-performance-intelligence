import { parseCriterionScores } from "@/lib/feedback/criteria";
import { classifyCompetency, type CompetencyAssessment, type CompetencyEvidence } from "./classify";

export type CompetencyRow = { id: string; domain_key: string; domain_name: string; name: string; description: string; sort_order: number };
export type MappingRow = { assessment_id: string; competency_id: string; mapping_source: CompetencyEvidence["mappingSource"]; review_status: string; criterion_label?: string | null };
export type AssessmentRow = { id: string; course_id: string; title: string };
export type SubmissionRow = { id: string; assessment_id: string; official_mark: number | string | null; official_feedback: string | null; official_mark_source: string | null; submitted_at: string | null; source_updated_at?: string | null };
export type CourseRow = { id: string; title: string };

export type CompetencyMapEntry = CompetencyRow & { assessment: CompetencyAssessment; mappedAssessments: number };
export type CompetencyDomain = { key: string; name: string; competencies: CompetencyMapEntry[] };

export function buildCompetencyMap(input: { competencies: CompetencyRow[]; mappings: MappingRow[]; assessments: AssessmentRow[]; submissions: SubmissionRow[]; courses: CourseRow[] }, now: Date = new Date()): CompetencyDomain[] {
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
    const base = { assessmentId: assessment.id, assessmentTitle: assessment.title, course: courseById.get(assessment.course_id) ?? "Course", mappingSource: mapping.mapping_source, granularity: "whole_assessment" as const };
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
    evidenceByCompetency.set(mapping.competency_id, [...(evidenceByCompetency.get(mapping.competency_id) ?? []), ...items]);
  }

  const domains = new Map<string, CompetencyDomain>();
  for (const competency of [...input.competencies].sort((a, b) => a.sort_order - b.sort_order)) {
    const domain = domains.get(competency.domain_key) ?? { key: competency.domain_key, name: competency.domain_name, competencies: [] };
    domain.competencies.push({ ...competency, assessment: classifyCompetency(evidenceByCompetency.get(competency.id) ?? [], now), mappedAssessments: mappedCount.get(competency.id) ?? 0 });
    domains.set(competency.domain_key, domain);
  }
  return [...domains.values()];
}
