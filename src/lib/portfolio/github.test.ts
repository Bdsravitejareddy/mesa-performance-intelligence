import { afterEach, describe, expect, it, vi } from "vitest";
import { githubAppConfig } from "./github";

describe("GitHub App configuration", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("needs every setting and a canonical HTTPS origin, never the request host", () => {
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "id"); vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "secret"); vi.stubEnv("GITHUB_APP_SLUG", "mesa"); vi.stubEnv("APP_BASE_URL", "https://example.test/");
    expect(githubAppConfig()).toMatchObject({ configured: true, callback: "https://example.test/api/github/callback" });
    vi.stubEnv("APP_BASE_URL", "http://example.test");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(githubAppConfig().configured).toBe(false);
  });
});
