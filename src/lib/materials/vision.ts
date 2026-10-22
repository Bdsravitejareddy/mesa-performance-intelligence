import type { SupabaseClient } from "@supabase/supabase-js";
import { describeVisualPages, MAX_INLINE_BYTES, QuotaExhaustedError, RecitationError, visionAvailable, type VisionPart } from "@/lib/ai/gemini-vision";
import { resolveProviderSettings } from "@/lib/ai/settings";
import { extractSlideAssets } from "./pptx-assets";
import { summarizeMaterialPages, type ReviewPage } from "./review";

const PDF = "application/pdf";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
// Failed documents are retried after a cool-down rather than on every run; quota exhaustion only waits for the next daily run.
const RETRY_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const QUOTA_RETRY_AFTER_MS = 12 * 60 * 60 * 1000;
const PAGES_PER_REQUEST = 4;
export const VECTOR_ONLY = "The flagged slides contain only vector graphics or shapes that cannot be extracted as images.";

// Each slide's parts start with its "Slide N of ..." text, followed by its images.
export function splitBatch(batch: { parts: VisionPart[]; pages: number[] }): { parts: VisionPart[]; pages: number[] }[] {
  const out: { parts: VisionPart[]; pages: number[] }[] = [];
  for (const part of batch.parts) {
    const slide = "text" in part ? part.text.match(/^Slide (\d+) of /) : null;
    if (slide) out.push({ pages: [Number(slide[1])], parts: [part] });
    else out.at(-1)?.parts.push(part);
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export type VisionOutcome = { materialId: string; status: "succeeded" | "failed" | "skipped"; requested: number; described: number; message: string; quotaExhausted?: boolean };

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

export function composeNote(description: { readableText: string; visualDescription: string; decorative: boolean }): string {
  const parts = [description.visualDescription, description.readableText ? `Text in the visual: ${description.readableText}` : ""].filter(Boolean);
  return (parts.join("\n") || (description.decorative ? "Decorative visual; no course information." : "")).slice(0, 2000);
}

// With redo, pages that already have an AI description are described again (e.g. after the instructions improve).
export async function describeMaterial(client: SupabaseClient, materialId: string, options: { redo?: boolean; keys?: string[] } = {}): Promise<VisionOutcome> {
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
  const done = new Set(options.redo ? [] : (existing ?? []).map((row) => row.page_number as number));
  const summary = summarizeMaterialPages((pages ?? []) as ReviewPage[]);
  const pending = summary.attention.filter((item) => !done.has(item.pageNumber));
  if (!pending.length) return { materialId, status: "skipped", requested: 0, described: 0, message: "Every flagged page already has a description." };

  const { data: file, error: downloadError } = await client.storage.from("course-files").download(material.storage_path);
  if (downloadError || !file) return record({ materialId, status: "failed", requested: pending.length, described: 0, message: "The stored file could not be read." });
  const bytes = new Uint8Array(await file.arrayBuffer());

  const textBy = new Map(((pages ?? []) as ReviewPage[]).map((page) => [page.page_number, page.extracted_text.replace(/\s+/g, " ").trim()]));
  // Requests carry at most a few pages each so the structured reply stays complete.
  const batches: { parts: VisionPart[]; pages: number[]; paraphrase?: boolean }[] = [];
  if (material.mime_type === PDF) {
    if (bytes.byteLength > MAX_INLINE_BYTES) return record({ materialId, status: "failed", requested: pending.length, described: 0, message: "The PDF is too large to send inline." });
    const pdfPart = { inlineData: { mimeType: PDF, data: toBase64(bytes) } };
    for (const group of chunk(pending.map((item) => item.pageNumber), PAGES_PER_REQUEST * 2)) batches.push({ pages: group, parts: [{ text: `Document "${material.name}". Describe only pages ${group.join(", ")}.` }, pdfPart] });
  } else if (material.mime_type === PPTX) {
    const assets = (await extractSlideAssets(bytes, pending.map((item) => item.pageNumber))).filter((slide) => slide.images.length || slide.chartText.length || slide.diagramText.length);
    for (const group of chunk(assets, PAGES_PER_REQUEST)) {
      const parts: VisionPart[] = [];
      for (const slide of group) {
        const context = [`Slide ${slide.slideNumber} of "${material.name}".`, `Text on the slide: ${(textBy.get(slide.slideNumber) ?? "").slice(0, 600) || "(none)"}.`, slide.chartText.length ? `Chart data: ${slide.chartText.join(" | ")}.` : "", slide.diagramText.length ? `Diagram labels: ${slide.diagramText.join(", ")}.` : "", slide.images.length ? `${slide.images.length} image(s) from this slide follow.` : ""].filter(Boolean).join(" ");
        parts.push({ text: context }, ...slide.images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: toBase64(image.data) } })));
      }
      batches.push({ pages: group.map((slide) => slide.slideNumber), parts });
    }
    if (!batches.length) return record({ materialId, status: "skipped", requested: pending.length, described: 0, message: VECTOR_ONLY });
  } else {
    return record({ materialId, status: "skipped", requested: 0, described: 0, message: "Only PDF and PPTX materials can be described." });
  }
  const requested = batches.flatMap((batch) => batch.pages);
  const unreadable = pending.length - requested.length;

  let described = 0;
  let model: string = available.model;
  const errors: string[] = [];
  for (const batch of batches) {
    try {
      const result = await describeVisualPages(batch.parts, batch.pages, process.env, options.keys, { paraphrase: batch.paraphrase });
      model = result.model;
      const rows = result.pages.map((page) => ({ user_id: material.user_id, material_id: material.id, page_number: page.page, author_kind: "ai_vision", provider_model: result.model, note: composeNote(page), colour_meaning: page.colourMeaning, decorative: page.decorative, updated_at: new Date().toISOString() })).filter((row) => row.note);
      if (rows.length) {
        const { error: saveError } = await client.from("material_page_notes").upsert(rows, { onConflict: "material_id,page_number,author_kind" });
        if (saveError) { errors.push("Descriptions could not be saved."); continue; }
      }
      described += rows.length;
    } catch (failure) {
      if (failure instanceof QuotaExhaustedError) return { ...(await record({ materialId, status: "failed", requested: requested.length, described, message: failure.message }, model)), quotaExhausted: true };
      // A malformed reply for a multi-slide request is retried one slide at a time.
      if (batch.pages.length > 1 && material.mime_type === PPTX) { batches.push(...splitBatch(batch).map((part) => ({ ...part, paraphrase: batch.paraphrase }))); continue; }
      // Gemini declined to reproduce published text verbatim: retry once asking for a summary instead.
      if (failure instanceof RecitationError && !batch.paraphrase) { batches.push({ ...batch, paraphrase: true }); continue; }
      errors.push(failure instanceof Error ? failure.message : "Description failed.");
    }
  }
  const vectorNote = unreadable > 0 ? ` ${unreadable} slide(s) contain only vector graphics or shapes.` : "";
  if (errors.length && !described) return record({ materialId, status: "failed", requested: requested.length, described: 0, message: `${errors[0]}${vectorNote}` }, model);
  return record({ materialId, status: "succeeded", requested: requested.length, described, message: `Described ${described} of ${requested.length} page(s).${errors.length ? ` ${errors.length} request(s) failed: ${errors[0]}` : ""}${vectorNote}` }, model);
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
    client.from("material_vision_runs").select("material_id, status, pages_described, message, ran_at").order("ran_at", { ascending: false }).limit(1000),
  ]);
  const latestRun = new Map<string, { status: string; message: string; ran_at: string }>();
  for (const run of runs ?? []) if (!latestRun.has(run.material_id)) latestRun.set(run.material_id, run);
  const queue = (flagged ?? []).map((row) => row.id as string).filter((id) => {
    const last = latestRun.get(id);
    const wait = last?.message.startsWith("Gemini quota") ? QUOTA_RETRY_AFTER_MS : RETRY_AFTER_MS;
    return !(last && last.status !== "succeeded" && now - new Date(last.ran_at).getTime() < wait);
  });
  const outcomes: VisionOutcome[] = [];
  let next = 0;
  // Every key but the last gets its own worker; the last key is a shared reserve each worker falls back to.
  const worker = async (keys: string[]) => {
    while (next < queue.length) {
      // Each document takes up to ~50s; stop before the platform limit.
      if (Date.now() > deadline - 55_000) return;
      const id = queue[next];
      next += 1;
      const outcome = await describeMaterial(client, id, { keys });
      if (outcome.status !== "skipped" || outcome.requested > 0) outcomes.push(outcome);
      // This worker's key and the reserve are out of quota: stop rather than fail every remaining document.
      if (outcome.quotaExhausted) return;
    }
  };
  await Promise.all(workerKeySets(resolveProviderSettings().keys).map(worker));
  return outcomes;
}

export function workerKeySets(keys: string[]): string[][] {
  if (keys.length <= 1) return [keys];
  const reserve = keys[keys.length - 1];
  return keys.slice(0, -1).map((key) => [key, reserve]);
}
