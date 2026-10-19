import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboardSnapshot } from "./dashboard-data";
import { createClient } from "./supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("dashboard setup state", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("reports missing configuration instead of showing an empty private workspace", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(getDashboardSnapshot()).rejects.toThrow("Supabase is not configured");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("keeps explicitly enabled sample data separate from the private workspace", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const snapshot = await getDashboardSnapshot();
    expect(snapshot.demoMode).toBe(true);
    expect(snapshot.courses.length).toBeGreaterThan(0);
    expect(createClient).not.toHaveBeenCalled();
  });
});
