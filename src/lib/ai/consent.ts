import { createHash } from "node:crypto";

export const AI_DISCLOSURE_VERSION = "mesa-ai-2026-10-22-v1";

export type AIProcessingConfig = {
  configured: boolean;
  providerHost: string;
  model: string;
  retentionNotice: string;
  disclosureVersion: string;
  configurationFingerprint: string;
};

export function getAIProcessingConfig(): AIProcessingConfig {
  const base = process.env.AI_API_BASE_URL?.trim() ?? "";
  const key = process.env.AI_API_KEY?.trim() ?? "";
  const model = process.env.AI_MODEL?.trim() ?? "";
  const retentionNotice = process.env.AI_DATA_RETENTION_NOTICE?.trim() ?? "";
  let providerHost = "";
  let endpoint = "";
  try {
    const url = new URL(base);
    if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash) {
      providerHost = url.hostname;
      endpoint = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
    }
  } catch { /* Invalid provider configuration remains unavailable. */ }
  const approved = process.env.AI_DATA_PROCESSING_APPROVED === "true";
  const configured = Boolean(approved && providerHost && endpoint && key && model && retentionNotice);
  const configurationFingerprint = createHash("sha256").update(JSON.stringify({ endpoint, providerHost, model, keyDigest: createHash("sha256").update(key).digest("hex"), approved, retentionNotice, disclosureVersion: AI_DISCLOSURE_VERSION })).digest("hex");
  return { configured, providerHost, model: model.slice(0, 120), retentionNotice, disclosureVersion: AI_DISCLOSURE_VERSION, configurationFingerprint };
}

export function isAIConsentCurrent(consent: { disclosure_version?: unknown; configuration_fingerprint?: unknown; provider_host?: unknown; provider_model?: unknown; revoked_at?: unknown } | null, config: AIProcessingConfig): boolean {
  return Boolean(config.configured && consent && consent.revoked_at === null && consent.disclosure_version === config.disclosureVersion && consent.configuration_fingerprint === config.configurationFingerprint && consent.provider_host === config.providerHost && consent.provider_model === config.model);
}
