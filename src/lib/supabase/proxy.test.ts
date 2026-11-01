import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "./proxy";

const session = vi.hoisted(() => ({ claims: null as Record<string, unknown> | null }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: session.claims } }) } }) }));
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
  it("passes the exact LMS cron route to bearer authentication", async () => {
    const response = await updateSession(new NextRequest("https://example.com/api/cron/lms-sync"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
  it.each(["/api/drive-agent", "/api/drive-agent/pair/extra", "/api/drive-agent/pairing", "/api/drive-agent/unknown", "/api/drive-sync/connections", "/api/cron/lms-sync/extra"])("keeps %s behind the interactive session", async (path) => {
    const response = await updateSession(new NextRequest(`https://example.com${path}`));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });
});

describe("guest sessions at the proxy", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("APP_ALLOWED_EMAILS", "member@example.com");
  });
  afterEach(() => { vi.unstubAllEnvs(); session.claims = null; });
  const guest = (minutes: number) => ({ sub: "g", email: "guest-1@guest.mesa-performance.invalid", app_metadata: { guest: true, guest_until: new Date(Date.now() + minutes * 60_000).toISOString() } });

  it("admits an active guest to the workspace despite the email allowlist", async () => {
    session.claims = guest(60);
    const response = await updateSession(new NextRequest("https://example.com/competencies"));
    expect(response.status).toBe(200);
  });
  it.each(["/api/lms-sync", "/api/lms/assignment", "/api/drive-sync/connections", "/api/github/connect", "/api/ai-consent", "/api/imports/nexus-outline", "/api/refresh", "/api/gradings/detach", "/api/assessment-competencies/auto"])("refuses a guest at %s", async (path) => {
    session.claims = guest(60);
    const response = await updateSession(new NextRequest(`https://example.com${path}`, { method: "POST" }));
    expect(response.status).toBe(403);
  });
  it("lets a guest make ordinary changes that are undone later", async () => {
    session.claims = guest(60);
    for (const path of ["/api/imports/quiz-tool", "/api/weekly-tasks", "/api/rubric", "/api/gradings"]) expect((await updateSession(new NextRequest(`https://example.com${path}`, { method: "POST" }))).status).toBe(200);
  });
  it("sends an expired guest to sign in again but still lets it sign out", async () => {
    session.claims = guest(-1);
    const response = await updateSession(new NextRequest("https://example.com/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=guest_expired");
    expect((await updateSession(new NextRequest("https://example.com/auth/signout", { method: "POST" }))).status).toBe(200);
  });
  it("ignores a guest flag in editable user metadata", async () => {
    session.claims = { sub: "x", email: "outsider@example.com", user_metadata: { guest: true, guest_until: new Date(Date.now() + 3_600_000).toISOString() } };
    const response = await updateSession(new NextRequest("https://example.com/"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/unauthorized");
  });
});
