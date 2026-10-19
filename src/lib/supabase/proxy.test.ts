import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "./proxy";

vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: null } }) } }) }));
describe("Drive machine proxy boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each(["pair", "session", "inventory", "upload", "finalize", "checkpoint"])("passes the exact %s machine route to its own authentication", async (name) => {
    const response = await updateSession(new NextRequest(`https://example.com/api/drive-agent/${name}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
  it.each(["/api/drive-agent", "/api/drive-agent/pair/extra", "/api/drive-agent/pairing", "/api/drive-agent/unknown", "/api/drive-sync/connections"])("keeps %s behind the interactive session", async (path) => {
    const response = await updateSession(new NextRequest(`https://example.com${path}`));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });
});
