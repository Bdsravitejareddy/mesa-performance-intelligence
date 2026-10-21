import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { AI_DISCLOSURE_VERSION } from "@/lib/ai/consent";
import { buildInsightSummaryContext, createInsightSummaryInputHash } from "@/lib/ai/summary-context";

const { from, provider } = vi.hoisted(() => ({ from: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "member-1" } } }) }, from }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));
vi.mock("@/lib/ai/provider", () => ({ requestJsonFromProvider: provider }));

describe("whole-workspace AI insight summary route", () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  it("blocks provider calls without current-user consent", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "Retention terms");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "secret");
    vi.stubEnv("AI_MODEL", "model-a");
    from.mockImplementation((table: string) => table === "ai_processing_consents" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) } : {});
    const response = await POST(new NextRequest("https://app.test/api/insights/summary", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it("blocks a previously consented account after revocation", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "Retention terms");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "secret");
    vi.stubEnv("AI_MODEL", "model-a");
    from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { disclosure_version: AI_DISCLOSURE_VERSION, revoked_at: "2026-10-22T00:00:00Z" }, error: null }) }) }) }));
    const response = await POST(new NextRequest("https://app.test/api/insights/summary", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it("returns a saved summary only when its input hash matches", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "Retention terms");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "secret");
    vi.stubEnv("AI_MODEL", "model-a");
    const summary = {
      strengths: [{ title: "Evidence unavailable", detail: "No saved evidence supports a performance claim yet.", sourceRefs: [], confidence: "insufficient" }],
      improvements: [{ title: "Add evidence", detail: "Attach a submission and course material first.", sourceRefs: [], confidence: "insufficient", whatStudentDid: "No submission was available.", courseExpectation: "Show assessed work.", whyIncomplete: "There is no work to compare.", illustrativeExample: "Illustrative: attach an answer with a cited course reference.", rubricAlignment: "Cannot assess an absent rubric.", professionalApplication: "A work sample is needed for role comparison." }],
      actions: [{ title: "Add a submission", detail: "Save one assessed work sample.", sourceRefs: [], confidence: "insufficient" }],
    };
    const emptyContext = buildInsightSummaryContext([]);
    const cacheHash = createInsightSummaryInputHash(emptyContext, "model-a", AI_DISCLOSURE_VERSION);
    const query = (data: unknown) => {
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit", "in"]) q[method] = () => q;
      q.maybeSingle = async () => ({ data, error: null });
      q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
      q.upsert = async () => ({ error: null });
      return q;
    };
    from.mockImplementation((table: string) => table === "ai_processing_consents" ? query({ disclosure_version: AI_DISCLOSURE_VERSION, revoked_at: null }) : table === "submissions" ? query([]) : table === "dashboard_insight_summaries" ? query({ input_hash: cacheHash, summary, sample_counts: { marks: 0, feedback: 0, evaluations: 0 } }) : query([]));
    const response = await POST(new NextRequest("https://app.test/api/insights/summary", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(provider).not.toHaveBeenCalled();
    const staleCacheQuery = (data: unknown) => query(data);
    from.mockImplementation((table: string) => table === "ai_processing_consents" ? staleCacheQuery({ disclosure_version: AI_DISCLOSURE_VERSION, revoked_at: null }) : table === "submissions" ? staleCacheQuery([]) : table === "dashboard_insight_summaries" ? staleCacheQuery({ input_hash: "stale", summary, sample_counts: {} }) : staleCacheQuery([]));
    provider.mockResolvedValue(summary);
    const staleResponse = await POST(new NextRequest("https://app.test/api/insights/summary", { method: "POST" }));
    expect(staleResponse.status).toBe(201);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
