import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeNote, describeMaterial } from "./vision";

type Row = Record<string, unknown>;
function fakeClient(tables: Record<string, Row[]>, file: Uint8Array) {
  const writes: { table: string; op: string; rows: unknown }[] = [];
  return {
    writes,
    storage: { from: () => ({ download: async () => ({ data: new Blob([file as BlobPart]), error: null }) }) },
    from(table: string) {
      const filters: [string, unknown][] = [];
      const rows = () => (tables[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (key: string, value: unknown) => { filters.push([key, value]); return chain; };
      chain.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
      chain.insert = async (value: unknown) => { writes.push({ table, op: "insert", rows: value }); return { error: null }; };
      chain.upsert = async (value: unknown) => { writes.push({ table, op: "upsert", rows: value }); return { error: null }; };
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve);
      return chain;
    },
  };
}

describe("describing flagged materials", () => {
  beforeEach(() => { vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true"); vi.stubEnv("GEMINI_API_KEY", "g-key"); vi.stubEnv("AI_API_BASE_URL", ""); vi.stubEnv("AI_API_KEY", ""); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("sends a scanned PDF once, stores labelled AI descriptions with colour meaning, and logs the run", async () => {
    const client = fakeClient({
      course_materials: [{ id: "m1", user_id: "owner", name: "Answer Key.pdf", mime_type: "application/pdf", storage_path: "owner/x/key.pdf" }],
      material_pages: [1, 2].map((page) => ({ material_id: "m1", page_number: page, extracted_text: "", table_data: [], has_visuals: false })),
      material_page_notes: [],
    }, new TextEncoder().encode("%PDF-1.4 scanned"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ pages: [{ page: 1, readable_text: "Q1 (b) Q2 (d)", visual_description: "Answer grid for set A", colour_meaning: "Correct options are highlighted in green", decorative: false }, { page: 2, readable_text: "", visual_description: "", colour_meaning: "", decorative: true }] }) }] } }] }))));
    const outcome = await describeMaterial(client as never, "m1");
    expect(outcome).toMatchObject({ status: "succeeded", requested: 2, described: 2 });
    const saved = client.writes.find((write) => write.table === "material_page_notes")?.rows as Row[];
    expect(saved[0]).toMatchObject({ user_id: "owner", page_number: 1, author_kind: "ai_vision", provider_model: "gemini-3.8-flash", colour_meaning: "Correct options are highlighted in green", note: "Answer grid for set A\nText in the visual: Q1 (b) Q2 (d)" });
    expect(saved[1]).toMatchObject({ page_number: 2, decorative: true, note: "Decorative visual; no course information." });
    expect(client.writes.find((write) => write.table === "material_vision_runs")?.rows).toMatchObject({ status: "succeeded", pages_described: 2 });
  });

  it("does nothing when every flagged page already has an AI description", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = fakeClient({
      course_materials: [{ id: "m1", user_id: "owner", name: "Key.pdf", mime_type: "application/pdf", storage_path: "p" }],
      material_pages: [{ material_id: "m1", page_number: 1, extracted_text: "", table_data: [], has_visuals: false }],
      material_page_notes: [{ material_id: "m1", page_number: 1, author_kind: "ai_vision" }],
    }, new Uint8Array([1]));
    expect((await describeMaterial(client as never, "m1")).status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a failed run without saving anything when Gemini errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const client = fakeClient({
      course_materials: [{ id: "m1", user_id: "owner", name: "Key.pdf", mime_type: "application/pdf", storage_path: "p" }],
      material_pages: [{ material_id: "m1", page_number: 1, extracted_text: "", table_data: [], has_visuals: false }],
      material_page_notes: [],
    }, new Uint8Array([1]));
    const outcome = await describeMaterial(client as never, "m1");
    expect(outcome).toMatchObject({ status: "failed", quotaExhausted: true });
    expect(client.writes.some((write) => write.table === "material_page_notes")).toBe(false);
  });

  it("marks quota exhaustion separately so the next daily run retries", async () => {
    vi.stubEnv("GEMINI_API_KEY_2", "g-key-2");
    const fetchMock = vi.fn(async () => new Response("quota", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = fakeClient({
      course_materials: [{ id: "m1", user_id: "owner", name: "Key.pdf", mime_type: "application/pdf", storage_path: "p" }],
      material_pages: [{ material_id: "m1", page_number: 1, extracted_text: "", table_data: [], has_visuals: false }],
      material_page_notes: [],
    }, new Uint8Array([1]));
    const outcome = await describeMaterial(client as never, "m1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ status: "failed", quotaExhausted: true });
    expect(outcome.message).toMatch(/next daily run/);
  });

  it("composes notes from description and visible text", () => {
    expect(composeNote({ readableText: "", visualDescription: "", decorative: false })).toBe("");
  });
});

describe("parallel key workers", () => {
  it("gives every key but the last its own worker, each falling back to the last", async () => {
    const { workerKeySets } = await import("./vision");
    expect(workerKeySets(["a", "b", "c", "d"])).toEqual([["a", "d"], ["b", "d"], ["c", "d"]]);
    expect(workerKeySets(["a", "b"])).toEqual([["a", "b"]]);
    expect(workerKeySets(["a"])).toEqual([["a"]]);
  });
});
