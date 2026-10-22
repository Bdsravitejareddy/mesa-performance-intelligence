import type { LibraryRole } from "@/lib/roles/library";

// How far each course has been demonstrated and what the standing means for each target role. Deterministic:
// the same records always give the same verdicts, and every verdict names the figures it rests on.
export const ROLE_THRESHOLDS = { core: 75, supporting: 65, peripheral: 50 } as const;
export type Relevance = keyof typeof ROLE_THRESHOLDS;
export type Verdict = "sufficient" | "needs_work" | "not_yet_evidenced";

export type StandingInput = {
  courses: { id: string; title: string; term: string | null }[];
  assessments: { id: string; course_id: string; official_max_mark: number | null }[];
  marks: { assessment_id: string; mark: number; weight: number }[];
  gradings: { assessment_id: string; ai_score: number | null }[];
  mappings: { assessment_id: string; competency_id: string }[];
  roles: LibraryRole[];
};

export type RoleView = { role: string; relevance: Relevance; overlap: number; threshold: number; verdict: Verdict };
export type CourseStanding = {
  courseId: string; title: string; term: string | null;
  assessments: number; evidenced: number; demonstratedShare: number;
  official: number | null; ai: number | null; standing: number | null; basis: "official" | "mixed" | "ai" | "none";
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
    const weightOf = (id: string) => Number(assessments.find((row) => row.id === id)?.official_max_mark ?? 100) || 100;
    const totalWeight = assessments.reduce((sum, row) => sum + (Number(row.official_max_mark) || 100), 0);
    const evidencedIds = new Set([...marks.map((row) => row.assessment_id), ...gradings.map((row) => row.assessment_id)]);
    const evidencedWeight = [...evidencedIds].reduce((sum, id) => sum + weightOf(id), 0);
    const markWeight = marks.reduce((sum, row) => sum + row.weight, 0);
    const official = marks.length && markWeight ? round1(marks.reduce((sum, row) => sum + row.mark * row.weight, 0) / markWeight) : null;
    const ai = gradings.length ? round1(gradings.reduce((sum, row) => sum + row.ai_score!, 0) / gradings.length) : null;
    // Per assessment: the official mark where released, otherwise the blind AI grade; weighted by maximum marks.
    const officialOf = new Map(marks.map((row) => [row.assessment_id, row.mark]));
    const aiOf = new Map(gradings.map((row) => [row.assessment_id, row.ai_score!]));
    const parts = [...evidencedIds].map((id) => ({ value: officialOf.get(id) ?? aiOf.get(id)!, weight: weightOf(id), official: officialOf.has(id) }));
    const partWeight = parts.reduce((sum, part) => sum + part.weight, 0);
    const standing = parts.length && partWeight ? round1(parts.reduce((sum, part) => sum + part.value * part.weight, 0) / partWeight) : null;
    const basis: CourseStanding["basis"] = !parts.length ? "none" : parts.every((part) => part.official) ? "official" : parts.some((part) => part.official) ? "mixed" : "ai";
    const roleViews: RoleView[] = roles.map((role) => {
      const share = overlap(course.id, role.required);
      const relevance: Relevance = share >= 0.2 || topThree.get(role.name)?.has(course.id) ? "core" : share > 0 ? "supporting" : "peripheral";
      const threshold = ROLE_THRESHOLDS[relevance];
      return { role: role.name, relevance, overlap: Math.round(share * 100) / 100, threshold, verdict: standing === null ? "not_yet_evidenced" : standing >= threshold ? "sufficient" : "needs_work" };
    });
    return {
      courseId: course.id, title: course.title, term: course.term,
      assessments: assessments.length, evidenced: evidencedIds.size, demonstratedShare: totalWeight ? Math.round((evidencedWeight / totalWeight) * 100) / 100 : 0,
      official, ai, standing, basis, roles: roleViews,
    } satisfies CourseStanding;
  }).filter((row): row is CourseStanding => row !== null);
}
