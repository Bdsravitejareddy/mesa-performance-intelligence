import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { getAIProcessingConfig } from "@/lib/ai/consent";
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
    const aiConfig = getAIProcessingConfig();
    from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { disclosure_version: aiConfig.disclosureVersion, configuration_fingerprint: aiConfig.configurationFingerprint, provider_host: aiConfig.providerHost, provider_model: aiConfig.model, revoked_at: "2026-10-22T00:00:00Z" }, error: null }) }) }) }));
    const response = await POST(new NextRequest("https://app.test/api/insights/summary", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it("blocks generation when the processor configuration no longer matches consent", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "Retention terms");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "secret");
    vi.stubEnv("AI_MODEL", "model-a");
    const oldConfig = getAIProcessingConfig();
    vi.stubEnv("AI_MODEL", "model-b");
    from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { disclosure_version: oldConfig.disclosureVersion, configuration_fingerprint: oldConfig.configurationFingerprint, provider_host: oldConfig.providerHost, provider_model: oldConfig.model, revoked_at: null }, error: null }) }) }) }));
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
    const aiConfig = getAIProcessingConfig();
    const summary = {
      strengths: [{ title: "Evidence unavailable", detail: "No saved evidence supports a performance claim yet.", sourceRefs: [], confidence: "insufficient" }],
      improvements: [{ title: "Add evidence", detail: "Attach a submission and course material first.", sourceRefs: [], confidence: "insufficient", whatStudentDid: "No submission was available.", courseExpectation: "Show assessed work.", whyIncomplete: "There is no work to compare.", illustrativeExample: "Illustrative: attach an answer with a cited course reference.", rubricAlignment: "Cannot assess an absent rubric.", professionalApplication: "A work sample is needed for role comparison." }],
      actions: [{ title: "Add a submission", detail: "Save one assessed work sample.", sourceRefs: [], confidence: "insufficient" }],
    };
    const emptyContext = buildInsightSummaryContext([]);
    const cacheHash = createInsightSummaryInputHash(emptyContext, "model-a", aiConfig.disclosureVersion, aiConfig.configurationFingerprint);
    const query = (data: unknown) => {
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit", "in"]) q[method] = () => q;
      q.maybeSingle = async () => ({ data, error: null });
      q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
      q.upsert = async () => ({ error: null });
      return q;
    };
    from.mockImplementation((table: string) => table === "ai_processing_consents" ? query({ disclosure_version: aiConfig.disclosureVersion, configuration_fingerprint: aiConfig.configurationFingerprint, provider_host: aiConfig.providerHost, provider_model: aiConfig.model, revoked_at: null }) : table === "submissions" ? query([]) : table === "dashboard_insight_summaries" ? query({ input_hash: cacheHash, summary, sample_counts: { marks: 0, feedback: 0, evaluations: 0 } }) : query([]));
    const response = await POST(new NextRequest("https://app.test/api/insights/summary", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(provider).not.toHaveBeenCalled();
    const staleCacheQuery = (data: unknown) => query(data);
    from.mockImplementation((table: string) => table === "ai_processing_consents" ? staleCacheQuery({ disclosure_version: aiConfig.disclosureVersion, configuration_fingerprint: aiConfig.configurationFingerprint, provider_host: aiConfig.providerHost, provider_model: aiConfig.model, revoked_at: null }) : table === "submissions" ? staleCacheQuery([]) : table === "dashboard_insight_summaries" ? staleCacheQuery({ input_hash: "stale", summary, sample_counts: {} }) : staleCacheQuery([]));
    provider.mockResolvedValue(summary);
    const staleResponse = await POST(new NextRequest("https://app.test/api/insights/summary", { method: "POST" }));
    expect(staleResponse.status).toBe(201);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("sends independent scores, report/evidence IDs, and linked course evidence in summary context", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "Retention terms");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "secret");
    vi.stubEnv("AI_MODEL", "model-a");
    const config = getAIProcessingConfig();
    const reportSummary = { strengths: [{ title: "Framework application", detail: "Applied the course framework to the case.", sourceRefs: ["S1"], confidence: "high" }], improvements: [], actions: [] };
    const rows: Record<string, unknown[]> = {
      submissions: [{ id: "submission-1", assessment_id: "assessment-1", official_mark: 78, official_feedback: "Clear reasoning" }],
      assessments: [{ id: "assessment-1", title: "Midterm", course_id: "course-1" }],
      evaluation_reports: [{ id: "report-1", submission_id: "submission-1", report: { summary: reportSummary, sourceReferences: [{ key: "S1", label: "Framework notes v2, page 4" }] }, created_at: "2026-10-21", mesa_academic_score: 84, analytical_score: 73, professional_score: 61, status: "draft" }],
      courses: [{ id: "course-1", title: "Health Strategy" }],
      evaluation_evidence: [{ id: "evidence-1", evaluation_id: "report-1", material_reference_id: "ref-1", layer: "mesa_academic", criterion: "Framework application", finding: "Mapped the framework correctly", confidence: "high", submission_quote: "The answer applies the model." }],
      material_references: [{ id: "ref-1", reference_label: "Framework notes v2, page 4" }],
    };
    const makeQuery = (data: unknown) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit", "in"]) query[method] = () => query;
      query.maybeSingle = async () => ({ data, error: null });
      query.upsert = async () => ({ error: null });
      query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
      return query;
    };
    from.mockImplementation((table: string) => table === "ai_processing_consents" ? makeQuery({ disclosure_version: config.disclosureVersion, configuration_fingerprint: config.configurationFingerprint, provider_host: config.providerHost, provider_model: config.model, revoked_at: null }) : table === "dashboard_insight_summaries" ? makeQuery(null) : makeQuery(rows[table] ?? []));
    const summary = {
      strengths: [{ title: "Course application", detail: "You applied a taught framework to the case.", sourceRefs: ["E1"], confidence: "high" }],
      improvements: [{ title: "Add alternatives", detail: "Compare an alternative framework.", sourceRefs: ["E1"], confidence: "medium", whatStudentDid: "Applied one model.", courseExpectation: "Compare relevant options.", whyIncomplete: "No alternative was assessed.", illustrativeExample: "Illustrative: compare two models against the course case.", rubricAlignment: "Framework application criterion.", professionalApplication: "Use alternatives to support product decisions." }],
      actions: [{ title: "Compare a second model", detail: "Add one alternative and justify the choice.", sourceRefs: ["E1"], confidence: "medium" }],
    };
    provider.mockImplementation(async (_system: string, prompt: string) => {
      const input = JSON.parse(prompt) as { evidence: string };
      expect(input.evidence).toContain("Saved evaluation report report-1");
      expect(input.evidence).toContain("Mesa academic=84, analytical=73, professional=61");
      expect(input.evidence).toContain("status=draft");
      expect(input.evidence).toContain("evidence evidence-1");
      expect(input.evidence).toContain("Framework notes v2, page 4");
      return summary;
    });
    const response = await POST(new NextRequest("https://app.test/api/insights/summary", { method: "POST", body: JSON.stringify({ refresh: true }) }));
    expect(response.status).toBe(201);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
