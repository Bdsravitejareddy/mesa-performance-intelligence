import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRelatedCourseIds } from "@/lib/courses/links";

type MaterialRow = { id: string; name: string; version: number; source_kind: string; drive_source_id?: string | null };
type NoteRow = { material_id: string; page_number: number; note: string };
type PageRow = { id: string; material_id: string; page_number: number; extracted_text: string; table_data: unknown; has_visuals: boolean; visual_notes: string };

export type RetrievedReference = { key: string; pageId: string; materialId: string; label: string; excerpt: string; sourceKind: string };

export async function retrieveRelevantReferences(supabase: SupabaseClient, courseId: string, assessmentId: string, query: string): Promise<RetrievedReference[]> {
  const terms = [...new Set((query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []))].slice(0, 16);
  if (!terms.length) return [];
  const { data: materials, error: materialError } = await supabase.from("current_course_materials").select("id, name, version, source_kind, drive_source_id").in("course_id", await loadRelatedCourseIds(supabase, courseId)).or(`assessment_id.is.null,assessment_id.eq.${assessmentId}`);
  if (materialError) throw new Error("Current course materials could not be loaded.");
  const materialRows = (materials ?? []) as MaterialRow[];
  if (!materialRows.length) return [];
  const byId = new Map(materialRows.map((item) => [item.id, item]));
  const materialIds = materialRows.map((item) => item.id);
  const columns = "id, material_id, page_number, extracted_text, table_data, has_visuals, visual_notes";
  const [{ data: textPages }, { data: noteRows }] = await Promise.all([
    supabase.from("material_pages").select(columns).in("material_id", materialIds).textSearch("search_document", terms.join(" OR "), { type: "websearch", config: "simple" }).limit(8),
    supabase.from("material_page_notes").select("material_id, page_number, note").in("material_id", materialIds),
  ]);
  // Member notes describe slides the importer could not read; a matching note can surface an otherwise text-less slide.
  const noteKey = (materialId: string, pageNumber: number) => `${materialId}:${pageNumber}`;
  const notes = new Map(((noteRows ?? []) as NoteRow[]).map((row) => [noteKey(row.material_id, row.page_number), row.note]));
  const pages = [...((textPages ?? []) as PageRow[])];
  const seen = new Set(pages.map((page) => noteKey(page.material_id, page.page_number)));
  const noteMatches = ((noteRows ?? []) as NoteRow[]).filter((row) => !seen.has(noteKey(row.material_id, row.page_number)) && terms.some((term) => row.note.toLocaleLowerCase().includes(term))).slice(0, Math.max(0, 8 - pages.length));
  for (const row of noteMatches) {
    const { data: page } = await supabase.from("material_pages").select(columns).eq("material_id", row.material_id).eq("page_number", row.page_number).maybeSingle();
    if (page) pages.push(page as PageRow);
  }
  return pages.filter((page) => byId.has(page.material_id)).map((page, index) => {
    const material = byId.get(page.material_id)!;
    const tableText = JSON.stringify(page.table_data ?? []).slice(0, 500);
    const memberNote = notes.get(noteKey(page.material_id, page.page_number));
    const visual = memberNote ? `\nMember note on visual content (a workspace member's interpretation, not course text): ${memberNote}` : page.has_visuals ? `\nVisual note: ${page.visual_notes || "Visual content detected; interpretation is unavailable."}` : "";
    return {
      key: `S${index + 1}`,
      pageId: page.id,
      materialId: page.material_id,
      label: `${material.name} v${material.version}, page/slide ${page.page_number}`,
      sourceKind: material.source_kind,
      excerpt: `${page.extracted_text.slice(0, 1400)}${tableText === "[]" ? "" : `\nExtracted tables: ${tableText}`}${visual}`.slice(0, 2200),
    };
  });
}
