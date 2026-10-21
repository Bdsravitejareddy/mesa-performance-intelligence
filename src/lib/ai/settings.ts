// Server-only AI provider settings. Explicit AI_API_* settings win; otherwise GEMINI_API_KEY selects
// Google's OpenAI-compatible Gemini endpoint. Approval (AI_DATA_PROCESSING_APPROVED) is checked separately.

export const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
// Stable Flash model per ai.google.dev/gemini-api/docs/models (checked 2026-10-22). Override with AI_MODEL.
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";

export type ProviderSettings = { base: string; key: string; model: string; kind: "gemini" | "openai_compatible" };

export function resolveProviderSettings(env: NodeJS.ProcessEnv = process.env): ProviderSettings {
  const explicitBase = env.AI_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const explicitKey = env.AI_API_KEY?.trim() ?? "";
  const geminiKey = env.GEMINI_API_KEY?.trim() ?? "";
  const model = env.AI_MODEL?.trim() ?? "";
  if (!explicitBase && !explicitKey && geminiKey) return { base: GEMINI_OPENAI_BASE_URL, key: geminiKey, model: model || GEMINI_DEFAULT_MODEL, kind: "gemini" };
  return { base: explicitBase, key: explicitKey, model, kind: isGeminiBase(explicitBase) ? "gemini" : "openai_compatible" };
}

export function isProviderConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const settings = resolveProviderSettings(env);
  return env.AI_DATA_PROCESSING_APPROVED === "true" && Boolean(settings.base && settings.key && settings.model);
}

function isGeminiBase(base: string) {
  try { return new URL(base).hostname === "generativelanguage.googleapis.com"; } catch { return false; }
}
