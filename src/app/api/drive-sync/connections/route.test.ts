import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { PATCH } from "./[id]/route";
import { POST as REPAIR } from "./[id]/pairing/route";

const mocks = vi.hoisted(() => ({ member: vi.fn(), configure: vi.fn(), issue: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/drive-sync/auth", () => ({ requireWorkspaceMember: mocks.member, issuePairing: mocks.issue }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/drive-sync/store", () => ({ DriveSyncStore: class { configure = mocks.configure; status = mocks.status; } }));
const id = "11111111-1111-4111-8111-111111111111";
const mapping = { id, driveFolderId: "google_folder_123456", mode: "course", courseId: null, rootCourseTitle: "Finance" };
const connection = { id, user_id: "owner", label: "Personal", enabled: true, mapping_revision: 1, last_error: null, last_scan_at: null, created_at: "2026-01-01", drive_folder_mappings: [{ id, drive_folder_id: mapping.driveFolderId, mode: mapping.mode, course_id: mapping.courseId, root_course_title: mapping.rootCourseTitle, enabled: true }], token_hash: "SECRET_HASH", pairing_hash: "SECRET_PAIR" };
const req = (body: unknown, method = "POST") => new Request("https://example.com/api/drive-sync/connections", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id }) };
describe("signed-in Drive connection management", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "SERVER_SECRET");
    vi.stubEnv("APP_BASE_URL", "https://dashboard.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    mocks.member.mockResolvedValue({ userId: "actor" });
    mocks.status.mockResolvedValue([{id,paired:false,latestScan:null,counts:{total:0,indexed:0,unsupported:0,failed:0,unavailable:0},sources:[]}]);
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
  it("rejects missing canonical installer configuration before writing any connector", async () => {
    vi.stubEnv('APP_BASE_URL','');vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL','');
    expect((await POST(req({label:'Personal',mappings:[mapping]}))).status).toBe(503);
    expect(mocks.configure).not.toHaveBeenCalled();expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("keeps demo mode read-only even with otherwise complete server settings", async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE','true');
    expect((await POST(req({label:'Personal',mappings:[mapping]}))).status).toBe(503);
    expect(mocks.configure).not.toHaveBeenCalled();
  });
  it("renders installers from the canonical origin without using untrusted Host settings", async () => {
    const response=await POST(new Request('https://untrusted.example/api/drive-sync/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'Personal',mappings:[mapping]})}));
    const body=await response.json();expect(response.status).toBe(201);
    expect(body.setup.code).toContain('https://dashboard.example');
    expect(body.setup.code).not.toContain('https://untrusted.example');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it("creates with the authenticated actor and normalizes a Drive folder link", async () => {
    const response = await POST(req({ label: "Personal", mappings: [{ ...mapping, id: undefined, driveFolderId: "https://drive.google.com/drive/u/0/folders/google_folder_123456?usp=sharing" }] }));
    expect(response.status).toBe(201);
    expect(mocks.configure).toHaveBeenCalledWith("actor", null, [{ driveFolderId: mapping.driveFolderId, mode: "course", courseId: null, rootCourseTitle: "Finance" }], "Personal", true);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["connection", "expiresAt", "pairingCode", "setup"]);
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
  it("preserves and validates resource keys from supported folder links", async () => {
    const response = await POST(req({label:"Personal",mappings:[{...mapping,driveFolderId:"https://drive.google.com/drive/folders/google_folder_123456?resourcekey=0-safe_KEY"}]}));
    expect(response.status).toBe(201);
    expect(mocks.configure.mock.calls[0][2][0]).toMatchObject({resourceKey:"0-safe_KEY"});
    for (const value of ['https://drive.google.com/open?id=google_folder_123456&resourcekey=bad/key','https://drive.google.com/drive/folders/google_folder_123456?resourcekey=','https://drive.google.com/drive/folders/google_folder_123456?resourcekey=key&resourcekey=other']) {
      expect((await POST(req({label:'Personal',mappings:[{...mapping,driveFolderId:value}]}))).status).toBe(400);
    }
    expect((await POST(req({label:'Personal',mappings:[{...mapping,resourceKey:'bad/key'}]}))).status).toBe(400);
  });
  it("returns the same shared status for either invited member without starting imports", async () => {
    const first = await (await GET()).json();
    mocks.member.mockResolvedValue({userId:'other-approved-member'});
    const second = await (await GET()).json();
    expect(second).toEqual(first);
    expect(second.connections[0]).toMatchObject({paired:false,counts:{total:0}});
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
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
  it("preserves a stored resource key during label-only edits", async () => {
    mocks.maybeSingle.mockResolvedValue({data:{...connection,drive_folder_mappings:[{...connection.drive_folder_mappings[0],resource_key:'0-safe_KEY'}]},error:null});
    expect((await PATCH(req({label:'Renamed'},'PATCH'),ctx)).status).toBe(200);
    expect(mocks.configure.mock.calls[0][2][0]).toMatchObject({resourceKey:'0-safe_KEY'});
  });
  it("uses the atomic configuration update to pause and revoke", async () => {
    const response = await PATCH(req({ enabled: false }, "PATCH"), ctx);
    expect(response.status).toBe(200);
    expect(mocks.configure).toHaveBeenCalledWith("actor", id, expect.any(Array), "Personal", false, 1);
  });
  it("returns 409 for a concurrent stale patch without restoring old mappings or enabled state", async () => {
    let saved = { label: "Personal", enabled: true, mappingRevision: 1, mappings: [mapping] };
    const replacement = { ...mapping, driveFolderId: "replacement_folder_123" };
    let releaseRename!: () => void;
    const pauseSaved = new Promise<void>((resolve) => { releaseRename = resolve; });
    mocks.configure.mockImplementation(async (_actor, _id, folders, title, enabled, revision) => {
      if (title === "Stale rename") await pauseSaved;
      if (revision !== undefined && revision !== saved.mappingRevision) throw Object.assign(new Error("Connection changed"), { code: "40001" });
      saved = { label: title, enabled, mappingRevision: saved.mappingRevision + 1, mappings: folders };
      releaseRename();
      return { id, userId: "owner", ...saved };
    });
    const responses = await Promise.all([
      PATCH(req({ enabled: false, mappings: [replacement] }, "PATCH"), ctx),
      PATCH(req({ label: "Stale rename" }, "PATCH"), ctx),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await responses.find((response) => response.status === 409)!.json()).toEqual({ error: "Drive connection changed. Reload it and try again." });
    expect(saved).toMatchObject({ enabled: false, label: "Personal", mappings: [{ driveFolderId: replacement.driveFolderId }], mappingRevision: 2 });
  });
  it("requires JSON objects, rejects malformed and oversized bodies", async () => {
    for (const body of ["{", JSON.stringify(null), JSON.stringify({ pad: "a".repeat(512 * 1024) })]) {
      const response = await POST(new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
      expect([400, 413]).toContain(response.status);
    }
    expect(mocks.configure).not.toHaveBeenCalled();
  });
});
