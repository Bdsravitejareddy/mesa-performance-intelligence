import { describe, expect, it } from "vitest";
import { GEMINI_DEFAULT_MODEL, GEMINI_OPENAI_BASE_URL, isProviderConfigured, resolveProviderSettings } from "./settings";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("AI provider settings", () => {
  it("uses Gemini's OpenAI-compatible endpoint when only GEMINI_API_KEY is set", () => {
    expect(resolveProviderSettings(env({ GEMINI_API_KEY: "g-key" }))).toEqual({ base: GEMINI_OPENAI_BASE_URL, key: "g-key", model: GEMINI_DEFAULT_MODEL, kind: "gemini" });
    expect(resolveProviderSettings(env({ GEMINI_API_KEY: "g-key", AI_MODEL: "gemini-3.5-flash-lite" })).model).toBe("gemini-3.5-flash-lite");
  });

  it("prefers explicit AI_API_* settings", () => {
    const settings = resolveProviderSettings(env({ GEMINI_API_KEY: "g", AI_API_BASE_URL: "https://model.example/v1/", AI_API_KEY: "k", AI_MODEL: "m" }));
    expect(settings).toEqual({ base: "https://model.example/v1", key: "k", model: "m", kind: "openai_compatible" });
  });

  it("still requires explicit processing approval", () => {
    expect(isProviderConfigured(env({ GEMINI_API_KEY: "g" }))).toBe(false);
    expect(isProviderConfigured(env({ GEMINI_API_KEY: "g", AI_DATA_PROCESSING_APPROVED: "true" }))).toBe(true);
    expect(isProviderConfigured(env({ AI_DATA_PROCESSING_APPROVED: "true" }))).toBe(false);
  });
});
