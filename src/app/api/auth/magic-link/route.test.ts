import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const { signInWithOtp } = vi.hoisted(() => ({ signInWithOtp: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp } }),
}));

describe("owner magic-link onboarding", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ALLOWED_EMAIL", "owner@example.com");
    vi.stubEnv("APP_ALLOWED_EMAILS", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    signInWithOtp.mockResolvedValue({ error: null });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("allows the configured owner to create their initial auth account", async () => {
    const response = await POST(new NextRequest("https://mesa-performance-intelligence.vercel.app/api/auth/magic-link", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "owner@example.com" }),
    }));
    expect(response.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "owner@example.com", options: { shouldCreateUser: true, emailRedirectTo: "https://mesa-performance-intelligence.vercel.app/auth/callback" } });
  });

  it("never creates an account or sends a link to an email outside the allowlist", async () => {
    const response = await POST(new NextRequest("https://mesa-performance-intelligence.vercel.app/api/auth/magic-link", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "another@example.com" }),
    }));
    expect(response.status).toBe(403);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("supports a second explicitly allowed workspace email", async () => {
    vi.stubEnv("APP_ALLOWED_EMAILS", "owner@example.com, second@example.com");
    const response = await POST(new NextRequest("https://mesa-performance-intelligence.vercel.app/api/auth/magic-link", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "Second@Example.com" }),
    }));
    expect(response.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "second@example.com" }));
  });
});
