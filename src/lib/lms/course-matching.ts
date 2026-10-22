export type CourseIdentity = { userId: string; title: string; lmsCourseId: string | null };

export function matchingCourseId(matches: string[], courseByRowId: Map<string, CourseIdentity>, lmsCourseId: string): string | undefined {
  if (matches.length !== 1) return undefined;
  const match = courseByRowId.get(matches[0]);
  return match && (!match.lmsCourseId || match.lmsCourseId === lmsCourseId) ? matches[0] : undefined;
}

// Words that name a course's subject. Instructors ("with Prof. X"), numbers and filler words are ignored.
const FILLER = new Set(["and", "its", "the", "of", "for", "with", "to", "in", "a", "an", "mesa", "course", "session", "module", "prof", "fundamentals", "application", "power", "art"]);

export function courseSubjectWords(title: string): string[] {
  return title.replace(/\s+(with|by)\s+.*$/i, "").toLowerCase().match(/[a-z]+/g)?.filter((word) => word.length >= 4 && !FILLER.has(word)) ?? [];
}

// Suggests the course an assignment title names. Only a single, unambiguous match is returned.
export function suggestCourseForTitle(title: string, courses: { id: string; title: string }[]): { courseId: string; basis: string } | null {
  const words = new Set(title.toLowerCase().match(/[a-z]+/g) ?? []);
  const matches = courses.flatMap((course) => {
    const hits = courseSubjectWords(course.title).filter((word) => words.has(word));
    return hits.length ? [{ courseId: course.id, hits, title: course.title }] : [];
  });
  // The course naming the most subject words wins, but only if no other course ties with it.
  matches.sort((a, b) => b.hits.length - a.hits.length);
  if (!matches.length || (matches[1] && matches[1].hits.length === matches[0].hits.length)) return null;
  return { courseId: matches[0].courseId, basis: `Title "${title}" names ${matches[0].title} (${matches[0].hits.join(", ")}).` };
}
