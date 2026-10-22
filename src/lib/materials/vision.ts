import type { SupabaseClient } from "@supabase/supabase-js";
import { describeVisualPages, MAX_INLINE_BYTES, visionAvailable, type VisionPart } from "@/lib/ai/gemini-vision";
import { extractSlideAssets } from "./pptx-assets";
import { summarizeMaterialPages, type ReviewPage } from "./review";

const PDF = "application/pdf";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
// Failed documents are retried after a cool-down rather than on every run.
const RETRY_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export type VisionOutcome = { materialId: string; status: "succeeded" | "failed" | "skipped"; requested: number; described: number; message: string };

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

export function composeNote(description: { readableText: string; visualDescription: string; decorative: boolean }): string {
  const parts = [description.visualDescription, description.readableText ? `Text in the visual: ${description.readableText}` : ""].filter(Boolean);
  return (parts.join("\n") || (description.decorative ? "Decorative visual; no course information." : "")).slice(0, 2000);
}

export async function describeMaterial(client: SupabaseClient, materialId: string): Promise<VisionOutcome> {
  const available = visionAvailable();
  if (!available.ok) return { materialId, status: "skipped", requested: 0, described: 0, message: available.reason };
  const { data: material, error } = await client.from("course_materials").select("id, user_id, name, mime_type, storage_path").eq("id", materialId).maybeSingle();
  if (error || !material) return { materialId, status: "failed", requested: 0, described: 0, message: "Material not found." };
  const record = async (outcome: VisionOutcome, model = "") => {
    await client.from("material_vision_runs").insert({ user_id: material.user_id, material_id: material.id, status: outcome.status, provider_model: model, pages_requested: outcome.requested, pages_described: outcome.described, message: outcome.message.slice(0, 500) });
    return outcome;
  };

  const [{ data: pages }, { data: existing }] = await Promise.all([
    client.from("material_pages").select("page_number, extracted_text, table_data, has_visuals").eq("material_id", materialId),
    client.from("material_page_notes").select("page_number").eq("material_id", materialId).eq("author_kind", "ai_vision"),
  ]);
  const done = new Set((existing ?? []).map((row) => row.page_number as number));
  const summary = summarizeMaterialPages((pages ?? []) as ReviewPage[]);
  const pending = summary.attention.filter((item) => !done.has(item.pageNumber));
  if (!pending.length) return { materialId, status: "skipped", requested: 0, described: 0, message: "Every flagged page already has a description." };

  const { data: file, error: downloadError } = await client.storage.from("course-files").download(material.storage_path);
  if (downloadError || !file) return record({ materialId, status: "failed", requested: pending.length, described: 0, message: "The stored file could not be read." });
  const bytes = new Uint8Array(await file.arrayBuffer());

  const textBy = new Map(((pages ?? []) as ReviewPage[]).map((page) => [page.page_number, page.extracted_text.replace(/\s+/g, " ").trim()]));
  const parts: VisionPart[] = [];
  let requested: number[] = [];
  if (material.mime_type === PDF) {
    if (bytes.byteLength > MAX_INLINE_BYTES) return record({ materialId, status: "failed", requested: pending.length, described: 0, message: "The PDF is too large to send inline." });
    requested = pending.map((item) => item.pageNumber);
    parts.push({ text: `Document "${material.name}". Describe only pages ${requested.join(", ")}.` }, { inlineData: { mimeType: PDF, data: toBase64(bytes) } });
  } else if (material.mime_type === PPTX) {
    const assets = await extractSlideAssets(bytes, pending.map((item) => item.pageNumber));
    for (const slide of assets) {
      if (!slide.images.length && !slide.chartText.length && !slide.diagramText.length) continue;
      requested.push(slide.slideNumber);
      const context = [`Slide ${slide.slideNumber} of "${material.name}".`, `Text on the slide: ${(textBy.get(slide.slideNumber) ?? "").slice(0, 600) || "(none)"}.`, slide.chartText.length ? `Chart data: ${slide.chartText.join(" | ")}.` : "", slide.diagramText.length ? `Diagram labels: ${slide.diagramText.join(", ")}.` : "", slide.images.length ? `${slide.images.length} image(s) from this slide follow.` : ""].filter(Boolean).join(" ");
      parts.push({ text: context }, ...slide.images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: toBase64(image.data) } })));
    }
    if (!requested.length) return record({ materialId, status: "skipped", requested: pending.length, described: 0, message: "The flagged slides contain only vector graphics or shapes that cannot be extracted as images." });
  } else {
    return record({ materialId, status: "skipped", requested: 0, described: 0, message: "Only PDF and PPTX materials can be described." });
  }

  try {
    const result = await describeVisualPages(parts, requested);
    const rows = result.pages.map((page) => ({ user_id: material.user_id, material_id: material.id, page_number: page.page, author_kind: "ai_vision", provider_model: result.model, note: composeNote(page), colour_meaning: page.colourMeaning, decorative: page.decorative, updated_at: new Date().toISOString() })).filter((row) => row.note);
    if (rows.length) {
      const { error: saveError } = await client.from("material_page_notes").upsert(rows, { onConflict: "material_id,page_number,author_kind" });
      if (saveError) return record({ materialId, status: "failed", requested: requested.length, described: 0, message: "Descriptions could not be saved." }, result.model);
    }
    return record({ materialId, status: "succeeded", requested: requested.length, described: rows.length, message: `Described ${rows.length} of ${requested.length} page(s).` }, result.model);
  } catch (failure) {
    return record({ materialId, status: "failed", requested: requested.length, described: 0, message: failure instanceof Error ? failure.message : "Description failed." }, available.model);
  }
}

// Works through current flagged materials until the time budget runs out. Recently failed documents wait for a cool-down.
export async function describePendingMaterials(client: SupabaseClient, budgetMs: number, now = Date.now()): Promise<VisionOutcome[]> {
  const deadline = now + budgetMs;
  if (!visionAvailable().ok) return [];
  const { data: current } = await client.from("current_course_materials").select("id");
  const ids = (current ?? []).map((row) => row.id as string);
  if (!ids.length) return [];
  const [{ data: flagged }, { data: runs }] = await Promise.all([
    client.from("course_materials").select("id").in("id", ids).eq("extraction_status", "needs_visual_review").order("created_at"),
    client.from("material_vision_runs").select("material_id, status, pages_described, ran_at").order("ran_at", { ascending: false }).limit(1000),
  ]);
  const latestRun = new Map<string, { status: string; ran_at: string }>();
  for (const run of runs ?? []) if (!latestRun.has(run.material_id)) latestRun.set(run.material_id, run);
  const outcomes: VisionOutcome[] = [];
  for (const { id } of flagged ?? []) {
    // Each document takes up to ~50s; stop before the platform limit.
    if (Date.now() > deadline - 55_000) break;
    const last = latestRun.get(id);
    if (last && last.status !== "succeeded" && now - new Date(last.ran_at).getTime() < RETRY_AFTER_MS) continue;
    const outcome = await describeMaterial(client, id);
    if (outcome.status !== "skipped" || outcome.requested > 0) outcomes.push(outcome);
  }
  return outcomes;
}
