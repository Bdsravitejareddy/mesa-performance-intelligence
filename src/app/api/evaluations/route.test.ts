import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const { from, provider } = vi.hoisted(() => ({ from: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "member-1" } } }) }, from }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));
vi.mock("@/lib/ai/provider", () => ({ requestJsonFromProvider: provider }));

describe("evidence evaluation consent gate", () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  it("does not load student work or call the provider before current consent", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "Provider retention terms.");
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) });
    const response = await POST(new NextRequest("https://app.test/api/evaluations", { method: "POST", body: JSON.stringify({ submissionId: "submission-1" }) }));
    expect(response.status).toBe(403);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("ai_processing_consents");
    expect(provider).not.toHaveBeenCalled();
  });
  it("does not call the provider after consent was revoked", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "Provider retention terms.");
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { disclosure_version: "mesa-ai-2026-10-22-v1", revoked_at: "2026-10-22T00:00:00Z" }, error: null }) }) }) });
    const response = await POST(new NextRequest("https://app.test/api/evaluations", { method: "POST", body: JSON.stringify({ submissionId: "submission-1" }) }));
    expect(response.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
});
