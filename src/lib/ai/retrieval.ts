import type { SupabaseClient } from "@supabase/supabase-js";

type MaterialRow = { id: string; name: string; version: number; source_kind: string; drive_source_id?: string | null };
type PageRow = { id: string; material_id: string; page_number: number; extracted_text: string; table_data: unknown; has_visuals: boolean; visual_notes: string };

export type RetrievedReference = { key: string; pageId: string; materialId: string; label: string; excerpt: string; sourceKind: string };

export async function retrieveRelevantReferences(supabase: SupabaseClient, courseId: string, assessmentId: string, query: string): Promise<RetrievedReference[]> {
  const terms = [...new Set((query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []))].slice(0, 16);
  if (!terms.length) return [];
  const { data: materials, error: materialError } = await supabase.from("current_course_materials").select("id, name, version, source_kind, drive_source_id").eq("course_id", courseId).or(`assessment_id.is.null,assessment_id.eq.${assessmentId}`);
  if (materialError) throw new Error("Current course materials could not be loaded.");
  const materialRows = (materials ?? []) as MaterialRow[];
  if (!materialRows.length) return [];
  const byId = new Map(materialRows.map((item) => [item.id, item]));
  const { data: pages } = await supabase.from("material_pages").select("id, material_id, page_number, extracted_text, table_data, has_visuals, visual_notes").in("material_id", materialRows.map((item) => item.id)).textSearch("search_document", terms.join(" OR "), { type: "websearch", config: "simple" }).limit(8);
  return ((pages ?? []) as PageRow[]).filter((page) => byId.has(page.material_id)).map((page, index) => {
    const material = byId.get(page.material_id)!;
    const tableText = JSON.stringify(page.table_data ?? []).slice(0, 500);
    const visual = page.has_visuals ? `\nVisual note: ${page.visual_notes || "Visual content detected; interpretation is unavailable."}` : "";
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
