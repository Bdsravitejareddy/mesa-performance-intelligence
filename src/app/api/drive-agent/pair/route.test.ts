import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { HttpError } from "@/lib/drive-sync/http";
const mocks = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("@/lib/drive-sync/auth", () => ({ consumePairing: mocks.consume }));
describe("machine pairing endpoint", () => {
  beforeEach(() => { mocks.consume.mockResolvedValue({ token: "connector", connectionId: "connection" }); });
  afterEach(() => vi.clearAllMocks());
  const request = (body: string) => new Request("https://example.com/api/drive-agent/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  it("returns only the one-time exchange, with no caching", async () => {
    const response = await POST(request(JSON.stringify({ code: "a".repeat(43) })));
    expect(await response.json()).toEqual({ token: "connector", connectionId: "connection" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["{", "null", "[]", '{"code":3}', '{"code":"x","userId":"owner"}'])("rejects malformed metadata", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
  });
  it("returns JSON 401 for consumed or expired codes", async () => {
    mocks.consume.mockRejectedValue(new HttpError(401, "Invalid or expired pairing code"));
    const response = await POST(request('{"code":"x"}'));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
  });
  it("does not leak database or server secrets on unexpected failures", async () => {
    mocks.consume.mockRejectedValue(new Error("SUPABASE_SECRET_KEY=private google_token=private"));
    const response = await POST(request('{"code":"x"}'));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/private|SUPABASE|google_token/);
  });
});
