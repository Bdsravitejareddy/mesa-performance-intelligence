import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssessmentRow, CompetencyRow, CourseRow, MappingRow, SubmissionRow } from "./map";
import { loadRubric, type Rubric } from "@/lib/settings/rubric";

export type TestRow = { id: string; submitted_at: string; result: { sections?: Record<string, { correct: number; total: number; percent: number }> } };
export type GradeRow = { assessment_id: string; ai_score: number | string | null; created_at: string; ai_report?: { summary?: string } | null };
export type CompetencyInputs = { rubric?: Rubric; competencies: CompetencyRow[]; mappings: MappingRow[]; assessments: AssessmentRow[]; submissions: SubmissionRow[]; courses: CourseRow[]; tests?: TestRow[]; gradings?: GradeRow[] };

// Shared by the competency page, mapping updates and the scheduled sync so every caller classifies the same records.
export async function loadCompetencyInputs(supabase: SupabaseClient): Promise<CompetencyInputs> {
  const [competencies, mappings, assessments, submissions, courses, tests, gradings] = await Promise.all([
    supabase.from("competencies").select("id, domain_key, domain_name, name, description, sort_order").order("sort_order"),
    supabase.from("assessment_competencies").select("assessment_id, competency_id, mapping_source, review_status, criterion_label"),
    supabase.from("assessments").select("id, course_id, title").order("title"),
    supabase.from("submissions").select("id, assessment_id, official_mark, official_feedback, official_mark_source, submitted_at, source_updated_at"),
    supabase.from("courses").select("id, title"),
    // Only the two most recent reasoning attempts count, so retakes cannot inflate the evidence.
    supabase.from("test_attempts").select("id, submitted_at, result").eq("kind", "reasoning").not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(2),
    // Blind AI grades stand in, labelled, only where an assessment has no official mark.
    supabase.from("submission_gradings").select("assessment_id, ai_score, created_at, ai_report").eq("ai_status", "complete").not("ai_score", "is", null).order("created_at", { ascending: false }),
  ]);
  const rubric = await loadRubric(supabase);
  const error = competencies.error ?? mappings.error ?? assessments.error ?? submissions.error ?? courses.error;
  if (error) throw new Error("Could not load competency evidence. Check that the competency framework migration is applied.");
  return {
    rubric,
    competencies: (competencies.data ?? []) as CompetencyRow[],
    mappings: (mappings.data ?? []) as MappingRow[],
    assessments: (assessments.data ?? []) as AssessmentRow[],
    submissions: (submissions.data ?? []) as SubmissionRow[],
    courses: (courses.data ?? []) as CourseRow[],
    tests: tests.error ? [] : (tests.data ?? []) as TestRow[],
    gradings: gradings.error ? [] : (gradings.data ?? []) as GradeRow[],
  };
}
