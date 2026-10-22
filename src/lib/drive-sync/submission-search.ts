import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubmissionSearch = { id: string; courseFolderId: string; courseFolderTitle: string; terms?: string[]; fileIds?: string[] };

const FILLER = new Set(["the", "and", "of", "for", "with", "to", "in", "on", "a", "an", "copy", "important"]);

// Words a submitted copy keeps from the assignment title: "Copy of Session 1 Rapido Workbook" contains
// every word of "Session 1 Rapido Workbook". Up to four, in title order; numbers keep sessions apart.
export function searchTerms(title: string): string[] {
  const words = title.replace(/[_–—:|/\\()[\]"“”'’.,;!?+&]/g, " ").split(/[\s-]+/).map((word) => word.trim()).filter(Boolean);
  const kept = words.filter((word) => !FILLER.has(word.toLowerCase()) && (word.length >= 3 || /^\d+$/.test(word)));
  return [...new Set(kept)].slice(0, 4);
}

// One search per distinct (course, terms) for the LMS assessments in the workspace.
export async function buildSubmissionSearches(client: SupabaseClient): Promise<SubmissionSearch[]> {
  const [assessments, courses] = await Promise.all([
    client.from("assessments").select("title, course_id, source_record_id").like("source_record_id", "mesa-lms:%"),
    client.from("courses").select("id, title"),
  ]);
  if (assessments.error || courses.error) return [];
  const titles = new Map((courses.data ?? []).map((row) => [row.id as string, row.title as string]));
  const seen = new Set<string>();
  const searches: SubmissionSearch[] = [];
  for (const row of assessments.data ?? []) {
    const terms = searchTerms(row.title as string);
    const courseId = row.course_id as string;
    if (terms.length < 2 || !titles.has(courseId)) continue; // a one-word title would match too broadly
    const key = `${courseId}|${terms.map((term) => term.toLowerCase()).join(" ")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    searches.push({ id: `search:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`, courseFolderId: courseId, courseFolderTitle: titles.get(courseId)!, terms });
  }
  return searches.slice(0, 200);
}

// Files linked as submitted work on Nexus assignment pages, fetched directly by Drive ID (the student's Google
// access covers files group members shared with them). Grouped per LMS course; already-imported files are skipped.
export async function buildLinkedFileFetches(client: SupabaseClient): Promise<SubmissionSearch[]> {
  const { data: links, error } = await client.from("submission_links").select("drive_file_id, submission_id").not("drive_file_id", "is", null);
  if (error || !links?.length) return [];
  const ids = [...new Set(links.map((row) => row.drive_file_id as string))];
  const [imported, submissions] = await Promise.all([
    client.from("drive_sources").select("drive_file_id").in("drive_file_id", ids).not("current_material_id", "is", null),
    client.from("submissions").select("id, assessment_id, assessments(course_id, courses(title))").in("id", [...new Set(links.map((row) => row.submission_id as string))]),
  ]);
  const done = new Set((imported.data ?? []).map((row) => row.drive_file_id as string));
  const courseOf = new Map((submissions.data ?? []).map((row) => {
    const assessment = row.assessments as unknown as { course_id: string; courses: { title: string } | null } | null;
    return [row.id as string, assessment ? { id: assessment.course_id, title: assessment.courses?.title ?? "Course" } : null];
  }));
  const byCourse = new Map<string, { title: string; ids: Set<string> }>();
  for (const row of links) {
    const course = courseOf.get(row.submission_id as string);
    const id = row.drive_file_id as string;
    if (!course || done.has(id)) continue;
    const entry = byCourse.get(course.id) ?? { title: course.title, ids: new Set<string>() };
    entry.ids.add(id);
    byCourse.set(course.id, entry);
  }
  return [...byCourse.entries()].flatMap(([courseId, entry]) => {
    const all = [...entry.ids];
    return Array.from({ length: Math.ceil(all.length / 50) }, (_, index) => {
      const fileIds = all.slice(index * 50, index * 50 + 50);
      return { id: `files:${createHash("sha256").update(courseId + fileIds.join(",")).digest("hex").slice(0, 16)}`, courseFolderId: courseId, courseFolderTitle: entry.title, fileIds };
    });
  });
}
