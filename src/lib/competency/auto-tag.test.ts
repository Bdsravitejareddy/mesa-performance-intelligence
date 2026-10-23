import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./history", () => ({ recordCompetencySnapshots: vi.fn(async () => 0) }));
import { autoTagAssessments } from "./auto-tag";

function fakeClient(tables: Record<string, unknown[]>) {
  const inserts: Record<string, unknown>[] = [];
  const deletes: string[] = [];
  return { inserts, deletes, from(table: string) { const chain: Record<string, unknown> = {}; chain.select = () => chain; chain.limit = () => chain; chain.eq = () => chain; chain.in = () => chain; chain.delete = () => { deletes.push(table); return chain; }; chain.insert = async (row: Record<string, unknown>) => { inserts.push(row); return { error: null }; }; chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve); return chain; } };
}

describe("automatic competency mapping", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("applies every valid mapping from the brief with its confidence, replaces earlier AI ones and validates criteria", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true"); vi.stubEnv("GEMINI_API_KEY", "g"); vi.stubEnv("AI_API_BASE_URL", ""); vi.stubEnv("AI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ assessments: [{ id: "a1", competencies: [
      { competencyId: "business.strategy", rationale: "Requires a go-to-market plan.", confidence: "high" },
      { competencyId: "product.discovery", rationale: "Problem validation.", confidence: "low" },
      { competencyId: "made.up", rationale: "x", confidence: "high" },
    ], criteria: [{ label: "GTM foundations", competencyId: "business.strategy", rationale: "GTM" }, { label: "Invented criterion", competencyId: "business.strategy" }] }] }) } }] }))));
    const client = fakeClient({
      assessments: [{ id: "a1", user_id: "owner", title: "Entrepreneurship Mid-Term", course_id: "c1", brief: "Brief: validate the problem and outline a go-to-market plan." }, { id: "a2", user_id: "owner", title: "Done", course_id: "c1", brief: "" }],
      courses: [{ id: "c1", title: "Entrepreneurship 101" }],
      assessment_competencies: [{ assessment_id: "a1", mapping_source: "ai_suggested", review_status: "suggested", rationale: "AI-mapped (low confidence): title only" }, { assessment_id: "a2", mapping_source: "user_tagged", review_status: "accepted", rationale: null }],
      competencies: [{ id: "business.strategy", name: "Strategy", domain_name: "Business", description: "" }, { id: "product.discovery", name: "Discovery", domain_name: "Product", description: "" }],
      submissions: [{ assessment_id: "a1", official_feedback: "Problem & validation 3/5 | GTM foundations 2/5" }],
    });
    const result = await autoTagAssessments(client as never, "member");
    expect(result).toEqual({ assessments: 1, accepted: 2, suggested: 0, criteria: 1 });
    expect(client.inserts.map((row) => [row.competency_id, row.review_status, row.criterion_label ?? null])).toEqual([["business.strategy", "accepted", null], ["product.discovery", "accepted", null], ["business.strategy", "accepted", "GTM foundations"]]);
    expect(String(client.inserts[1].rationale)).toMatch(/\[brief-v2\] \(low confidence\): Problem validation/);
    expect(client.deletes).toEqual(["assessment_competencies"]);
  });
});
