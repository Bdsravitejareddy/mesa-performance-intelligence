import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubmissionSearch = { id: string; courseFolderId: string; courseFolderTitle: string; terms: string[] };

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
