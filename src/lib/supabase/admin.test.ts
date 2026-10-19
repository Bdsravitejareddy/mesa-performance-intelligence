import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "./admin";
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
describe("server-only privileged Supabase client", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret-fixture");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("uses a fresh secret-key client with no persisted or refreshed user session", () => {
    createAdminClient();
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "server-secret-fixture", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  });
  it.each(["SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL"])("fails closed without %s", (name) => {
    vi.stubEnv(name, "");
    expect(() => createAdminClient()).toThrow("configuration is unavailable");
    expect(createClient).not.toHaveBeenCalled();
  });
  it("cannot enable privileged work in demo mode", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    expect(() => createAdminClient()).toThrow("configuration is unavailable");
  });
});
