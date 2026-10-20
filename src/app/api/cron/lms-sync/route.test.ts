import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const { syncMesaLms } = vi.hoisted(() => ({ syncMesaLms: vi.fn() }));
vi.mock("@/lib/lms/sync", () => ({ syncMesaLms }));

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
  });
});
