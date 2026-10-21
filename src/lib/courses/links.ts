import type { SupabaseClient } from "@supabase/supabase-js";

export type CourseLink = { assessment_course_id: string; material_course_id: string };

// Every course whose materials belong with this course: itself plus confirmed links in either direction.
export function relatedCourseIds(courseId: string, links: CourseLink[]): string[] {
  const ids = new Set([courseId]);
  const assessmentSides = new Set([courseId, ...links.filter((link) => link.material_course_id === courseId).map((link) => link.assessment_course_id)]);
  for (const link of links) if (assessmentSides.has(link.assessment_course_id)) { ids.add(link.assessment_course_id); ids.add(link.material_course_id); }
  return [...ids];
}

export async function loadRelatedCourseIds(supabase: SupabaseClient, courseId: string): Promise<string[]> {
  const { data, error } = await supabase.from("course_links").select("assessment_course_id, material_course_id").or(`assessment_course_id.eq.${courseId},material_course_id.eq.${courseId}`);
  if (error) throw new Error("Linked courses could not be loaded.");
  const direct = (data ?? []) as CourseLink[];
  // A material course's siblings are reached through its assessment course.
  const parents = [...new Set(direct.filter((link) => link.material_course_id === courseId).map((link) => link.assessment_course_id))];
  if (!parents.length) return relatedCourseIds(courseId, direct);
  const { data: siblings, error: siblingError } = await supabase.from("course_links").select("assessment_course_id, material_course_id").in("assessment_course_id", parents);
  if (siblingError) throw new Error("Linked courses could not be loaded.");
  return relatedCourseIds(courseId, [...direct, ...((siblings ?? []) as CourseLink[])]);
}

type CourseForMatching = { id: string; title: string };

const PREFIX = /^mesa\s*sem\s*\d+\s*/i;
// LMS titles carry the instructor, e.g. "Fundamentals of Finance with Prof. Narahari".
const INSTRUCTOR = /\s+(with|by)\s+.*$/i;

export function courseTokens(title: string): string[] {
  return title.replace(PREFIX, "").replace(INSTRUCTOR, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

// A material course matches when its compact name equals a run of consecutive whole words in the assessment course title.
function matches(materialTitle: string, assessmentTitle: string): boolean {
  const key = courseTokens(materialTitle).join("");
  if (key.length < 2) return false;
  const words = courseTokens(assessmentTitle);
  for (let start = 0; start < words.length; start += 1) {
    let joined = "";
    for (let end = start; end < words.length; end += 1) {
      joined += words[end];
      if (joined === key) return true;
      if (joined.length >= key.length) break;
    }
  }
  return false;
}

export type LinkSuggestion = { materialCourse: CourseForMatching; assessmentCourse: CourseForMatching };

// Suggestions only. Ambiguous names (zero or several candidates) produce no suggestion; a member confirms every link.
export function suggestCourseLinks(materialCourses: CourseForMatching[], assessmentCourses: CourseForMatching[]): LinkSuggestion[] {
  const suggestions: LinkSuggestion[] = [];
  for (const materialCourse of materialCourses) {
    const candidates = assessmentCourses.filter((course) => course.id !== materialCourse.id && matches(materialCourse.title, course.title));
    if (candidates.length === 1) suggestions.push({ materialCourse, assessmentCourse: candidates[0] });
  }
  return suggestions;
}
