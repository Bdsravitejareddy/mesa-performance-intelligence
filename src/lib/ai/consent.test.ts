import { afterEach, describe, expect, it, vi } from "vitest";
import { getAIProcessingConfig, isAIConsentCurrent } from "./consent";

describe("provider-bound AI processing consent", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("fingerprints endpoint, key rotation, model, gate, and retention notice without exposing the key", () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "secret-key-one");
    vi.stubEnv("AI_MODEL", "model-a");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "30 day retention");
    const first = getAIProcessingConfig();
    expect(first).toMatchObject({ configured: true, providerHost: "provider.example", model: "model-a" });
    expect(first.configurationFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toContain("secret-key-one");
    vi.stubEnv("AI_API_KEY", "secret-key-two");
    expect(getAIProcessingConfig().configurationFingerprint).not.toBe(first.configurationFingerprint);
    vi.stubEnv("AI_API_KEY", "secret-key-one");
    vi.stubEnv("AI_MODEL", "model-b");
    expect(getAIProcessingConfig().configurationFingerprint).not.toBe(first.configurationFingerprint);
    vi.stubEnv("AI_MODEL", "model-a");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "90 day retention");
    expect(getAIProcessingConfig().configurationFingerprint).not.toBe(first.configurationFingerprint);
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "30 day retention");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/alternate");
    expect(getAIProcessingConfig().configurationFingerprint).not.toBe(first.configurationFingerprint);
    vi.stubEnv("AI_API_BASE_URL", "https://other-provider.example/v1");
    expect(getAIProcessingConfig().configurationFingerprint).not.toBe(first.configurationFingerprint);
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "false");
    expect(getAIProcessingConfig().configurationFingerprint).not.toBe(first.configurationFingerprint);
  });
  it("treats stale processor fingerprint, host, model, or disclosure as no current consent", () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_API_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "secret-key");
    vi.stubEnv("AI_MODEL", "model-a");
    vi.stubEnv("AI_DATA_RETENTION_NOTICE", "30 day retention");
    const config = getAIProcessingConfig();
    const consent = { disclosure_version: config.disclosureVersion, configuration_fingerprint: config.configurationFingerprint, provider_host: config.providerHost, provider_model: config.model, revoked_at: null };
    expect(isAIConsentCurrent(consent, config)).toBe(true);
    expect(isAIConsentCurrent({ ...consent, configuration_fingerprint: "0".repeat(64) }, config)).toBe(false);
    expect(isAIConsentCurrent({ ...consent, provider_model: "stale-model" }, config)).toBe(false);
    expect(isAIConsentCurrent({ ...consent, disclosure_version: "old" }, config)).toBe(false);
  });
});
