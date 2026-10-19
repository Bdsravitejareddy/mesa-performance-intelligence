import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";
import { POST as REPAIR } from "./[id]/pairing/route";

const mocks = vi.hoisted(() => ({ member: vi.fn(), configure: vi.fn(), issue: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/drive-sync/auth", () => ({ requireWorkspaceMember: mocks.member, issuePairing: mocks.issue }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/drive-sync/store", () => ({ DriveSyncStore: class { configure = mocks.configure; } }));
const id = "11111111-1111-4111-8111-111111111111";
const mapping = { id, driveFolderId: "google_folder_123456", mode: "course", courseId: null, rootCourseTitle: "Finance" };
const connection = { id, user_id: "owner", label: "Personal", enabled: true, mapping_revision: 1, last_error: null, last_scan_at: null, created_at: "2026-01-01", drive_folder_mappings: [{ id, drive_folder_id: mapping.driveFolderId, mode: mapping.mode, course_id: mapping.courseId, root_course_title: mapping.rootCourseTitle, enabled: true }], token_hash: "SECRET_HASH", pairing_hash: "SECRET_PAIR" };
const req = (body: unknown, method = "POST") => new Request("https://example.com/api/drive-sync/connections", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id }) };
describe("signed-in Drive connection management", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "SERVER_SECRET");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    mocks.member.mockResolvedValue({ userId: "actor" });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq, then: (resolve: (v: unknown) => void) => resolve({ data: [connection], error: null }) });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: connection, error: null });
    mocks.configure.mockResolvedValue({ id, userId: "actor", label: "Personal", enabled: true, mappingRevision: 1, mappings: [mapping], token_hash: "SECRET_HASH" });
    mocks.issue.mockResolvedValue({ pairingCode: "one-time-code", expiresAt: "2026-01-01" });
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  it("lists safe shared metadata without persisted credentials", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.configured).toBe(true);
    expect(body.connections[0]).toMatchObject({ id, label: "Personal", enabled: true, mappingRevision: 1 });
    expect(JSON.stringify(body)).not.toMatch(/SECRET|hash|SERVER_SECRET/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("reports missing server setup without creating a connector", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(await (await GET()).json()).toEqual({ configured: false, connections: [] });
    expect((await POST(req({ label: "Personal", mappings: [mapping] }))).status).toBe(503);
  });
  it("creates with the authenticated actor and normalizes a Drive folder link", async () => {
    const response = await POST(req({ label: "Personal", mappings: [{ ...mapping, id: undefined, driveFolderId: "https://drive.google.com/drive/u/0/folders/google_folder_123456?usp=sharing" }] }));
    expect(response.status).toBe(201);
    expect(mocks.configure).toHaveBeenCalledWith("actor", null, [{ driveFolderId: mapping.driveFolderId, mode: "course", courseId: null, rootCourseTitle: "Finance" }], "Personal", true);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["connection", "expiresAt", "pairingCode"]);
    expect(JSON.stringify(body)).not.toMatch(/SECRET|hash/);
  });
  it.each([
    { label: "x", mappings: [] },
    { label: "x", mappings: Array(21).fill(mapping) },
    { label: "x", mappings: [{ ...mapping, driveFolderId: "https://evil.test/drive/folders/abc" }] },
    { label: "x", mappings: [{ ...mapping, mode: "other" }] },
    { label: "x", mappings: [{ ...mapping, rootCourseTitle: "x".repeat(301) }] },
    { label: "x", userId: "someone-else", mappings: [mapping] },
  ])("rejects invalid or untrusted configuration", async (body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(mocks.configure).not.toHaveBeenCalled();
  });
  it("rejects a course outside the session's shared workspace", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(req({ label: "Personal", mappings: [{ ...mapping, courseId: id }] }))).status).toBe(403);
  });
  it("denies management when route authentication fails", async () => {
    const { HttpError } = await import("@/lib/drive-sync/http");
    mocks.member.mockRejectedValue(new HttpError(401, "Sign in required"));
    expect((await POST(req({ label: "Personal", mappings: [mapping] }))).status).toBe(401);
    expect(mocks.configure).not.toHaveBeenCalled();
  });
  it("denies updates and re-pairing for inaccessible connections before service writes", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await PATCH(req({ enabled: false }, "PATCH"), ctx)).status).toBe(404);
    expect((await REPAIR(req({}), ctx)).status).toBe(404);
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("uses the atomic configuration update to pause and revoke", async () => {
    const response = await PATCH(req({ enabled: false }, "PATCH"), ctx);
    expect(response.status).toBe(200);
    expect(mocks.configure).toHaveBeenCalledWith("actor", id, expect.any(Array), "Personal", false);
  });
  it("requires JSON objects, rejects malformed and oversized bodies", async () => {
    for (const body of ["{", JSON.stringify(null), JSON.stringify({ pad: "a".repeat(512 * 1024) })]) {
      const response = await POST(new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
      expect([400, 413]).toContain(response.status);
    }
    expect(mocks.configure).not.toHaveBeenCalled();
  });
});
