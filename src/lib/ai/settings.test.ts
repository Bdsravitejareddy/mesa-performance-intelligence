import { describe, expect, it } from "vitest";
import { GEMINI_DEFAULT_MODEL, GEMINI_OPENAI_BASE_URL, isProviderConfigured, resolveProviderSettings } from "./settings";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("AI provider settings", () => {
  it("uses Gemini's OpenAI-compatible endpoint when only GEMINI_API_KEY is set", () => {
    expect(resolveProviderSettings(env({ GEMINI_API_KEY: "g-key" }))).toEqual({ base: GEMINI_OPENAI_BASE_URL, key: "g-key", keys: ["g-key"], model: GEMINI_DEFAULT_MODEL, kind: "gemini" });
    expect(resolveProviderSettings(env({ GEMINI_API_KEY: "g-key", AI_MODEL: "gemini-3.5-flash-lite" })).model).toBe("gemini-3.5-flash-lite");
  });

  it("prefers explicit AI_API_* settings", () => {
    const settings = resolveProviderSettings(env({ GEMINI_API_KEY: "g", AI_API_BASE_URL: "https://model.example/v1/", AI_API_KEY: "k", AI_MODEL: "m" }));
    expect(settings).toEqual({ base: "https://model.example/v1", key: "k", keys: ["k"], model: "m", kind: "openai_compatible" });
  });

  it("still requires explicit processing approval", () => {
    expect(isProviderConfigured(env({ GEMINI_API_KEY: "g" }))).toBe(false);
    expect(isProviderConfigured(env({ GEMINI_API_KEY: "g", AI_DATA_PROCESSING_APPROVED: "true" }))).toBe(true);
    expect(isProviderConfigured(env({ AI_DATA_PROCESSING_APPROVED: "true" }))).toBe(false);
  });
});

describe("fallback Gemini keys", () => {
  it("lists the primary key first, then distinct fallbacks", () => {
    const settings = resolveProviderSettings(env({ GEMINI_API_KEY: "a", GEMINI_API_KEY_2: "b", GEMINI_API_KEY_3: "a", GEMINI_API_KEY_4: "c" }));
    expect(settings.keys).toEqual(["a", "b", "c"]);
    expect(settings.key).toBe("a");
  });

  it("moves to the next key on quota, auth or server errors and stops at the first success", async () => {
    const { fetchWithKeyFailover } = await import("./settings");
    const tried: string[] = [];
    const statuses: Record<string, number> = { a: 429, b: 403, c: 200, d: 200 };
    const response = await fetchWithKeyFailover(["a", "b", "c", "d"], async (key) => { tried.push(key); return new Response("{}", { status: statuses[key] }); });
    expect(response.status).toBe(200);
    expect(tried).toEqual(["a", "b", "c"]);
  });

  it("does not try further keys after a timeout, so the wait cannot multiply", async () => {
    const { fetchWithKeyFailover } = await import("./settings");
    const tried: string[] = [];
    await expect(fetchWithKeyFailover(["a", "b", "c"], async (key) => { tried.push(key); throw Object.assign(new Error("slow"), { name: "TimeoutError" }); })).rejects.toThrow("The AI provider timed out.");
    expect(tried).toEqual(["a"]);
  });

  it("does not retry a request the provider rejected as malformed", async () => {
    const { fetchWithKeyFailover } = await import("./settings");
    const tried: string[] = [];
    const response = await fetchWithKeyFailover(["a", "b"], async (key) => { tried.push(key); return new Response("{}", { status: 400 }); });
    expect(response.status).toBe(400);
    expect(tried).toEqual(["a"]);
  });

  it("reports network failure without exposing a key", async () => {
    const { fetchWithKeyFailover } = await import("./settings");
    await expect(fetchWithKeyFailover(["secret-key-1", "secret-key-2"], async () => { throw new Error("connect failed for secret-key-2"); })).rejects.toThrow("The AI provider could not be reached.");
  });
});
