import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, POST } from "./route";
import { getAIProcessingConfig } from "@/lib/ai/consent";

const { from, upsert, update, maybeSingle, claims } = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(), claims: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: claims }, from }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));

describe("AI processing consent", () => {
  beforeEach(() => { claims.mockResolvedValue({ data: { claims: { sub: "member-1" } } }); });
  afterEach(() => { vi.clearAllMocks(); claims.mockResolvedValue({ data: { claims: { sub: "member-1" } } }); vi.unstubAllEnvs(); });
  it("requires configured provider and retention disclosure, and reports host only", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "never-return-this");
    vi.stubEnv("AI_MODEL", "model-a");
    maybeSingle.mockResolvedValue({ data: { disclosure_version: "mesa-ai-2026-10-22-v1", configuration_fingerprint: "0".repeat(64), provider_host: "provider.example", provider_model: "model-a", revoked_at: null } });
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    const response = await GET();
    const body = await response!.json();
    expect(body).toMatchObject({ configured: false, providerHost: "provider.example", model: "model-a", consented: false });
    expect(JSON.stringify(body)).not.toContain("never-return-this");
    expect(body.configurationFingerprint).toBeUndefined();
  });
  it("records only agreement to the fixed current disclosure", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "server-secret");
    vi.stubEnv("AI_MODEL", "model-a");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "Provider retention notice.");
    from.mockReturnValue({ upsert });
    upsert.mockResolvedValue({ error: null });
    const response = await POST(new NextRequest("https://app.test/api/ai-consent", { method: "POST", body: JSON.stringify({ agree: true, disclosureVersion: "mesa-ai-2026-10-22-v1" }) }));
    expect(response!.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "member-1", disclosure_version: "mesa-ai-2026-10-22-v1", configuration_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), provider_host: "provider.example", provider_model: "model-a" }), { onConflict: "user_id" });
  });
  it("does not save consent while provider or retention disclosure is missing", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "server-secret");
    vi.stubEnv("AI_MODEL", "model-a");
    const response = await POST(new NextRequest("https://app.test/api/ai-consent", { method: "POST", body: JSON.stringify({ agree: true, disclosureVersion: "mesa-ai-2026-10-22-v1" }) }));
    expect(response!.status).toBe(503);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("does not accept stale disclosure agreement", async () => {
    const response = await POST(new NextRequest("https://app.test/api/ai-consent", { method: "POST", body: JSON.stringify({ agree: true, disclosureVersion: "old" }) }));
    expect(response!.status).toBe(409);
  });
  it("reports consent as stale after provider configuration changes", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "model-old");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "Provider retention notice.");
    const oldConfig = getAIProcessingConfig();
    vi.stubEnv("AI_MODEL", "model-new");
    maybeSingle.mockResolvedValue({ data: { disclosure_version: oldConfig.disclosureVersion, configuration_fingerprint: oldConfig.configurationFingerprint, provider_host: oldConfig.providerHost, provider_model: oldConfig.model, revoked_at: null }, error: null });
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    const response = await GET();
    expect((await response!.json()).consented).toBe(false);
  });
  it("revokes consent for the current authenticated user", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ update });
    update.mockReturnValue({ eq });
    const response = await DELETE();
    expect(response!.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ revoked_at: expect.any(String) }));
  });
  it("rejects anonymous consent reads and revocations", async () => {
    claims.mockResolvedValue({ data: { claims: {} } });
    expect((await GET())!.status).toBe(401);
    expect((await DELETE())!.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});
