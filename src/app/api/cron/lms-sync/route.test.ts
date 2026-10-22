import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const { syncMesaLms } = vi.hoisted(() => ({ syncMesaLms: vi.fn() }));
vi.mock("@/lib/lms/sync", () => ({ syncMesaLms }));
const { describePendingMaterials } = vi.hoisted(() => ({ describePendingMaterials: vi.fn(async () => []) }));
vi.mock("@/lib/materials/vision", () => ({ describePendingMaterials }));
vi.mock("@/lib/materials/submission-matching", () => ({ matchDriveSubmissions: vi.fn(async () => []) }));
vi.mock("@/lib/competency/auto-tag", () => ({ autoTagAssessments: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

describe("daily LMS cron route", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("fails closed when the Vercel Cron secret is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(new NextRequest("https://mesa.test/api/cron/lms-sync"));
    expect(response.status).toBe(401);
    expect(syncMesaLms).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer secret without running the importer", async () => {
    vi.stubEnv("CRON_SECRET", "configured-secret");
    const response = await GET(new NextRequest("https://mesa.test/api/cron/lms-sync", { headers: { authorization: "Bearer wrong-secret" } }));
    expect(response.status).toBe(401);
    expect(syncMesaLms).not.toHaveBeenCalled();
  });

  it("runs only after the exact cron bearer secret matches", async () => {
    vi.stubEnv("CRON_SECRET", "configured-secret");
    syncMesaLms.mockResolvedValue({ status: "succeeded", marks: 1 });
    const response = await GET(new NextRequest("https://mesa.test/api/cron/lms-sync", { headers: { authorization: "Bearer configured-secret" } }));
    expect(response.status).toBe(200);
    expect(syncMesaLms).toHaveBeenCalledOnce();
    expect(describePendingMaterials).toHaveBeenCalledOnce();
  });

  it("still describes materials and reports 502 when the LMS sync fails", async () => {
    vi.stubEnv("CRON_SECRET", "configured-secret");
    syncMesaLms.mockRejectedValue(new Error("token expired"));
    const response = await GET(new NextRequest("https://mesa.test/api/cron/lms-sync", { headers: { authorization: "Bearer configured-secret" } }));
    expect(response.status).toBe(502);
    expect(describePendingMaterials).toHaveBeenCalledOnce();
    expect(JSON.stringify(await response.json())).not.toContain("token expired");
  });
});
