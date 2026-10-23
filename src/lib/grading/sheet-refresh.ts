import type { SupabaseClient } from "@supabase/supabase-js";
import { extractXlsxSheets, FORMULA_MARKER } from "@/lib/office-documents";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Workbooks read before formulas were kept are read again from their private stored copy, once: the new text
// always carries the formula marker. Only the extracted text changes; the file, version and provenance stay.
export async function refreshSheetFormulas(client: SupabaseClient, budgetMs: number): Promise<number> {
  const deadline = Date.now() + budgetMs;
  const { data: docs } = await client.from("submission_documents").select("id, storage_path, course_material_id")
    .eq("mime_type", XLSX).not("extracted_text", "ilike", `%${FORMULA_MARKER}%`).limit(40);
  let refreshed = 0;
  for (const doc of docs ?? []) {
    if (Date.now() > deadline) break;
    try {
      let bucket = "submission-files";
      let path = doc.storage_path as string | null;
      if (!path && doc.course_material_id) {
        const { data: material } = await client.from("course_materials").select("storage_path").eq("id", doc.course_material_id).maybeSingle();
        bucket = "course-files";
        path = (material?.storage_path as string | undefined) ?? null;
      }
      if (!path) continue;
      const { data: file } = await client.storage.from(bucket).download(path);
      if (!file) continue;
      const pages = await extractXlsxSheets(new Uint8Array(await file.arrayBuffer()));
      const text = pages.map((page) => `[Page or sheet ${page.pageNumber}]\n${page.text}`).join("\n\n").replace(/\u0000/g, "").slice(0, 500_000);
      const { error } = await client.from("submission_documents").update({ extracted_text: text }).eq("id", doc.id);
      if (!error) refreshed += 1;
    } catch {
      // A workbook that cannot be read again keeps its earlier text and is graded as before.
    }
  }
  return refreshed;
}
