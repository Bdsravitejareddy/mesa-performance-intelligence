export type CourseIdentity = { userId: string; title: string; lmsCourseId: string | null };

export function matchingCourseId(matches: string[], courseByRowId: Map<string, CourseIdentity>, lmsCourseId: string): string | undefined {
  if (matches.length !== 1) return undefined;
  const match = courseByRowId.get(matches[0]);
  return match && (!match.lmsCourseId || match.lmsCourseId === lmsCourseId) ? matches[0] : undefined;
}
