import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./history", () => ({ recordCompetencySnapshots: vi.fn(async () => 0) }));
import { autoTagAssessments } from "./auto-tag";

function fakeClient(tables: Record<string, unknown[]>) {
  const inserts: Record<string, unknown>[] = [];
  return { inserts, from(table: string) { const chain: Record<string, unknown> = {}; chain.select = () => chain; chain.insert = async (row: Record<string, unknown>) => { inserts.push(row); return { error: null }; }; chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve); return chain; } };
}

describe("automatic competency mapping", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("applies confident mappings with their reason, holds back low ones and validates criteria", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true"); vi.stubEnv("GEMINI_API_KEY", "g"); vi.stubEnv("AI_API_BASE_URL", ""); vi.stubEnv("AI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ assessments: [{ id: "a1", competencies: [
      { competencyId: "business.strategy", rationale: "Requires a go-to-market plan.", confidence: "high" },
      { competencyId: "product.discovery", rationale: "Problem validation.", confidence: "low" },
      { competencyId: "made.up", rationale: "x", confidence: "high" },
    ], criteria: [{ label: "GTM foundations", competencyId: "business.strategy", rationale: "GTM" }, { label: "Invented criterion", competencyId: "business.strategy" }] }] }) } }] }))));
    const client = fakeClient({
      assessments: [{ id: "a1", user_id: "owner", title: "Entrepreneurship Mid-Term", course_id: "c1" }],
      courses: [{ id: "c1", title: "Entrepreneurship 101" }],
      assessment_competencies: [],
      competencies: [{ id: "business.strategy", name: "Strategy", domain_name: "Business", description: "" }, { id: "product.discovery", name: "Discovery", domain_name: "Product", description: "" }],
      submissions: [{ assessment_id: "a1", official_feedback: "Problem & validation 3/5 | GTM foundations 2/5" }],
    });
    const result = await autoTagAssessments(client as never, "member");
    expect(result).toEqual({ assessments: 1, accepted: 1, suggested: 1, criteria: 1 });
    expect(client.inserts.map((row) => [row.competency_id, row.review_status, row.criterion_label ?? null])).toEqual([["business.strategy", "accepted", null], ["product.discovery", "suggested", null], ["business.strategy", "accepted", "GTM foundations"]]);
    expect(String(client.inserts[0].rationale)).toMatch(/^AI-mapped \(high confidence\): Requires a go-to-market plan/);
  });
});
