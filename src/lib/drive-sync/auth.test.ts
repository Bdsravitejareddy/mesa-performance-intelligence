import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumePairing, hashConnectorSecret, issuePairing, requireConnector, requireWorkspaceMember } from "./auth";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), authenticate: vi.fn(), consume: vi.fn(), issue: vi.fn(), budget: vi.fn(), headers: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("./store", () => ({ DriveSyncStore: class {
  authenticate = mocks.authenticate; consumePairing = mocks.consume; issuePairing = mocks.issue; checkPairingBudget = mocks.budget;
} }));

describe("Drive authentication boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("VERCEL", "1");
    mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": "192.0.2.1" }));
    vi.stubEnv("APP_ALLOWED_EMAILS", "first@example.com,second@example.com");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "actor", email: "first@example.com", email_confirmed_at: "2026-01-01" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.authenticate.mockResolvedValue({ connectionId: "connection", userId: "owner" });
    mocks.budget.mockResolvedValue(true);
    mocks.issue.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it.each(["first@example.com", "second@example.com"])("accepts the verified invited member %s", async (email) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "actor", email, email_confirmed_at: "2026-01-01" } }, error: null });
    await expect(requireWorkspaceMember()).resolves.toEqual({ userId: "actor" });
  });
  it.each([
    null,
    { id: "actor", email: "first@example.com", email_confirmed_at: null },
    { id: "actor", email: "outsider@example.com", email_confirmed_at: "2026-01-01", user_metadata: { email: "first@example.com" } },
  ])("denies absent, unverified, or outsider identities", async (user) => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    await expect(requireWorkspaceMember()).rejects.toMatchObject({ status: user ? 403 : 401 });
  });
  it("denies an allowlisted user whose database invitation was removed", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireWorkspaceMember()).rejects.toMatchObject({ status: 403 });
  });
  it("fails closed in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    await expect(requireWorkspaceMember()).rejects.toMatchObject({ status: 503 });
  });
  it.each([undefined, "Bearer wrong", "Basic abc", `Bearer ${"a".repeat(43)} extra`])("rejects malformed connector authorization", async (authorization) => {
    const request = new Request("https://example.com/api/drive-agent/session", { headers: authorization ? { authorization } : {} });
    await expect(requireConnector(request)).rejects.toMatchObject({ status: 401 });
  });
  it("returns only the connector's server-resolved identity", async () => {
    const token = "a".repeat(43);
    await expect(requireConnector(new Request("https://example.com", { headers: { authorization: `Bearer ${token}` } }))).resolves.toEqual({ connectionId: "connection", userId: "owner" });
    expect(hashConnectorSecret("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("denies revoked connections and connections with unverified owners", async () => {
    mocks.authenticate.mockResolvedValue(null);
    await expect(requireConnector(new Request("https://example.com", { headers: { authorization: `Bearer ${"a".repeat(43)}` } }))).rejects.toMatchObject({ status: 401 });
  });
  it("issues a 256-bit code with a 15 minute expiry and stores only its hash", async () => {
    const result = await issuePairing("connection");
    expect(Buffer.from(result.pairingCode, "base64url")).toHaveLength(32);
    expect(new Date(result.expiresAt).getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(mocks.issue).toHaveBeenCalledWith("connection", hashConnectorSecret(result.pairingCode), result.expiresAt);
  });
  it("exchanges a code once using the atomic store and never returns hashes", async () => {
    mocks.consume.mockResolvedValueOnce({ connectionId: "connection", userId: "owner" }).mockRejectedValueOnce(new Error("Invalid or expired pairing"));
    const code = "b".repeat(43);
    const result = await consumePairing(code);
    expect(result.connectionId).toBe("connection");
    expect(Buffer.from(result.token, "base64url")).toHaveLength(32);
    expect(Object.keys(result).sort()).toEqual(["connectionId", "token"]);
    await expect(consumePairing(code)).rejects.toMatchObject({ status: 401 });
  });
  it("passes only domain-separated hashes of the trusted caller and code to the durable budget", async () => {
    mocks.consume.mockResolvedValue({ connectionId: "connection", userId: "owner" });
    const code = "c".repeat(43);
    await consumePairing(code);
    expect(mocks.budget).toHaveBeenCalledWith(hashConnectorSecret("drive-agent-pair-caller:192.0.2.1"), hashConnectorSecret(`drive-agent-pair-code:${code}`));
    expect(JSON.stringify(mocks.budget.mock.calls)).not.toContain("192.0.2.1");
  });
  it.each(["", "192.0.2.1, 192.0.2.2", "untrusted"])("rejects a missing or malformed Vercel client address: %s", async (address) => {
    mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": address, "x-forwarded-for": "192.0.2.9", "x-real-ip": "192.0.2.9" }));
    await expect(consumePairing("a".repeat(43))).rejects.toMatchObject({ status: 503 });
    expect(mocks.budget).not.toHaveBeenCalled();
  });
  it("does not trust caller-supplied Vercel headers outside a Vercel runtime", async () => {
    vi.stubEnv("VERCEL", "");
    await expect(consumePairing("a".repeat(43))).rejects.toMatchObject({ status: 503 });
    expect(mocks.budget).not.toHaveBeenCalled();
  });
  it("canonicalizes equivalent IPv6 addresses before hashing", async () => {
    mocks.consume.mockResolvedValue({ connectionId: "connection" });
    for (const address of ["2001:0db8:0:0:0:0:0:1", "2001:db8::1"]) {
      mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": address }));
      await consumePairing("a".repeat(43));
    }
    expect(mocks.budget.mock.calls[0][0]).toBe(hashConnectorSecret("drive-agent-pair-caller:2001:db8::1"));
    expect(mocks.budget.mock.calls[0][0]).toBe(mocks.budget.mock.calls[1][0]);
  });
  it("enforces persistent pairing budgets even for invalid codes", async () => {
    mocks.budget.mockResolvedValue(false);
    await expect(consumePairing("invalid")).rejects.toMatchObject({ status: 429 });
  });
});
