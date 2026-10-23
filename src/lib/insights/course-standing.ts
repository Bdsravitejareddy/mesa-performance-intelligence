import type { LibraryRole } from "@/lib/roles/library";
import { STAKES_WEIGHT, stakesOf } from "@/lib/assessments/stakes";

// How far each course has been demonstrated and what the standing means for each target role. Deterministic:
// the same records always give the same verdicts, and every verdict names the figures it rests on.
export const ROLE_THRESHOLDS = { core: 75, supporting: 65, peripheral: 50 } as const;
export type Relevance = keyof typeof ROLE_THRESHOLDS;
export type Verdict = "sufficient" | "needs_work" | "not_yet_evidenced" | "awaiting_results";
export type CourseContext = { assessedBy: string; expected: string; scaleMax: number | null; note: string };

export type StandingInput = {
  courses: { id: string; title: string; term: string | null; context?: CourseContext | null }[];
  assessments: { id: string; course_id: string; official_max_mark: number | null; title?: string }[];
  marks: { assessment_id: string; mark: number; weight: number }[];
  gradings: { assessment_id: string; ai_score: number | null }[];
  mappings: { assessment_id: string; competency_id: string }[];
  roles: LibraryRole[];
};

export type RoleView = { role: string; relevance: Relevance; overlap: number; threshold: number; verdict: Verdict; why: string };
export type CourseStanding = {
  courseId: string; title: string; term: string | null;
  assessments: number; evidenced: number; demonstratedShare: number;
  official: number | null; ai: number | null; standing: number | null; basis: "official" | "mixed" | "ai" | "none";
  // Official marks first; "projected" adds AI estimates for unmarked work and is shown beside, never instead.
  projected: number | null; relative: number | null; context: CourseContext | null;
  roles: RoleView[];
};

const round1 = (value: number) => Math.round(value * 10) / 10;

export function courseStanding(input: StandingInput): CourseStanding[] {
  const competenciesOf = new Map<string, Set<string>>();
  const courseOfAssessment = new Map(input.assessments.map((row) => [row.id, row.course_id]));
  for (const mapping of input.mappings) {
    const course = courseOfAssessment.get(mapping.assessment_id);
    if (!course) continue;
    competenciesOf.set(course, (competenciesOf.get(course) ?? new Set()).add(mapping.competency_id));
  }
  const roles = input.roles.filter((role) => role.tier === "primary").map((role) => ({
    name: role.name,
    required: new Set(role.requirements.filter((requirement) => !requirement.eligibility).flatMap((requirement) => requirement.competencyIds)),
  }));
  // Per role, a course is core when it assesses at least a fifth of the role's skills or is among the three that assess the most.
  const overlap = (courseId: string, required: Set<string>) => {
    if (!required.size) return 0;
    const assessed = competenciesOf.get(courseId) ?? new Set<string>();
    return [...required].filter((id) => assessed.has(id)).length / required.size;
  };
  const topThree = new Map(roles.map((role) => [role.name, new Set(input.courses.map((course) => ({ id: course.id, share: overlap(course.id, role.required) })).filter((row) => row.share > 0.1).sort((a, b) => b.share - a.share).slice(0, 3).map((row) => row.id))]));

  return input.courses.map((course) => {
    const assessments = input.assessments.filter((row) => row.course_id === course.id);
    if (!assessments.length) return null;
    const ids = new Set(assessments.map((row) => row.id));
    const marks = input.marks.filter((row) => ids.has(row.assessment_id));
    const gradings = input.gradings.filter((row) => ids.has(row.assessment_id) && row.ai_score !== null);
    // Term exams count three times practice work, on top of their maximum marks (see stakes.ts).
    const stakesWeight = (id: string) => { const title = assessments.find((row) => row.id === id)?.title; return title ? STAKES_WEIGHT[stakesOf(title)] : STAKES_WEIGHT.graded; };
    const weightOf = (id: string) => (Number(assessments.find((row) => row.id === id)?.official_max_mark ?? 100) || 100) * stakesWeight(id);
    const totalWeight = assessments.reduce((sum, row) => sum + weightOf(row.id), 0);
    const evidencedIds = new Set([...marks.map((row) => row.assessment_id), ...gradings.map((row) => row.assessment_id)]);
    const evidencedWeight = [...evidencedIds].reduce((sum, id) => sum + weightOf(id), 0);
    const markWeight = marks.reduce((sum, row) => sum + row.weight * stakesWeight(row.assessment_id), 0);
    const official = marks.length && markWeight ? round1(marks.reduce((sum, row) => sum + row.mark * row.weight * stakesWeight(row.assessment_id), 0) / markWeight) : null;
    const aiWeight = gradings.reduce((sum, row) => sum + stakesWeight(row.assessment_id), 0);
    const ai = gradings.length && aiWeight ? round1(gradings.reduce((sum, row) => sum + row.ai_score! * stakesWeight(row.assessment_id), 0) / aiWeight) : null;
    // Per assessment: the official mark where released, otherwise the blind AI grade; weighted by maximum marks.
    const officialOf = new Map(marks.map((row) => [row.assessment_id, row.mark]));
    const aiOf = new Map(gradings.map((row) => [row.assessment_id, row.ai_score!]));
    const parts = [...evidencedIds].map((id) => ({ value: officialOf.get(id) ?? aiOf.get(id)!, weight: weightOf(id), official: officialOf.has(id) }));
    const partWeight = parts.reduce((sum, part) => sum + part.weight, 0);
    const projected = parts.length && partWeight ? round1(parts.reduce((sum, part) => sum + part.value * part.weight, 0) / partWeight) : null;
    const standing = official ?? ai;
    const basis: CourseStanding["basis"] = official !== null ? (parts.some((part) => !part.official) ? "mixed" : "official") : ai !== null ? "ai" : "none";
    // Scores on a scale whose observed ceiling is below 100 (e.g. MRS, cohort high 79) are read against that ceiling.
    const context = course.context ?? null;
    const relative = standing !== null && context?.scaleMax ? round1(Math.min(100, (standing / context.scaleMax) * 100)) : standing;
    const roleViews: RoleView[] = roles.map((role) => {
      const share = overlap(course.id, role.required);
      const relevance: Relevance = share >= 0.2 || topThree.get(role.name)?.has(course.id) ? "core" : share > 0 ? "supporting" : "peripheral";
      const threshold = ROLE_THRESHOLDS[relevance];
      const verdict: Verdict = relative === null ? (context?.expected ? "awaiting_results" : "not_yet_evidenced") : relative >= threshold ? "sufficient" : "needs_work";
      const assessedSkills = [...role.required].filter((id) => (competenciesOf.get(course.id) ?? new Set()).has(id)).length;
      const why = relevance === "core"
        ? share >= 0.2 ? `Core: its assessments cover ${assessedSkills} of the ${role.required.size} skills this role's postings ask for (${Math.round(share * 100)}%).` : `Core: among the three courses whose assessments cover the most of this role's skills (${assessedSkills} of ${role.required.size}).`
        : relevance === "supporting" ? `Supporting: its assessments cover ${assessedSkills} of the role's ${role.required.size} skills.` : "Peripheral: its assessments cover none of the skills this role's postings ask for.";
      return { role: role.name, relevance, overlap: Math.round(share * 100) / 100, threshold, verdict, why };
    });
    return {
      courseId: course.id, title: course.title, term: course.term,
      assessments: assessments.length, evidenced: evidencedIds.size, demonstratedShare: totalWeight ? Math.round((evidencedWeight / totalWeight) * 100) / 100 : 0,
      official, ai, standing, basis, projected, relative, context, roles: roleViews,
    } satisfies CourseStanding;
  }).filter((row): row is CourseStanding => row !== null);
}
