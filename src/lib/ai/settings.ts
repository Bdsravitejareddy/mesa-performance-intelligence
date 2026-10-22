// Server-only AI provider settings. Explicit AI_API_* settings win; otherwise GEMINI_API_KEY selects
// Google's OpenAI-compatible Gemini endpoint. Approval (AI_DATA_PROCESSING_APPROVED) is checked separately.

export const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
// Stable Flash model per ai.google.dev/gemini-api/docs/models (checked 2026-10-22). Override with AI_MODEL.
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";

// key is the primary key; keys lists it first, followed by any distinct fallbacks to try when it fails.
export type ProviderSettings = { base: string; key: string; keys: string[]; model: string; kind: "gemini" | "openai_compatible" };

// Fallback Gemini keys, tried in order when the previous key is rejected, rate-limited or the service errors.
export const GEMINI_FALLBACK_KEY_NAMES = ["GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY_4"] as const;

export function resolveProviderSettings(env: NodeJS.ProcessEnv = process.env): ProviderSettings {
  const explicitBase = env.AI_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const explicitKey = env.AI_API_KEY?.trim() ?? "";
  const geminiKey = env.GEMINI_API_KEY?.trim() ?? "";
  const model = env.AI_MODEL?.trim() ?? "";
  if (!explicitBase && !explicitKey && geminiKey) {
    const keys = [...new Set([geminiKey, ...GEMINI_FALLBACK_KEY_NAMES.map((name) => env[name]?.trim() ?? "")].filter(Boolean))];
    return { base: GEMINI_OPENAI_BASE_URL, key: geminiKey, keys, model: model || GEMINI_DEFAULT_MODEL, kind: "gemini" };
  }
  return { base: explicitBase, key: explicitKey, keys: explicitKey ? [explicitKey] : [], model, kind: isGeminiBase(explicitBase) ? "gemini" : "openai_compatible" };
}

export function isProviderConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const settings = resolveProviderSettings(env);
  return env.AI_DATA_PROCESSING_APPROVED === "true" && Boolean(settings.base && settings.key && settings.model);
}

function isGeminiBase(base: string) {
  try { return new URL(base).hostname === "generativelanguage.googleapis.com"; } catch { return false; }
}

// Statuses where another key may succeed: invalid/revoked key, quota or rate limit, or a transient server error.
const RETRYABLE = new Set([401, 403, 429, 500, 502, 503, 504]);

// Sends the request with each key in turn until one gets a non-retryable response. Key values never appear in errors.
export async function fetchWithKeyFailover(keys: string[], send: (key: string) => Promise<Response>): Promise<Response> {
  if (!keys.length) throw new Error("No AI provider key is configured.");
  let last: Response | null = null;
  let lastError: unknown = null;
  for (const key of keys) {
    try {
      const response = await send(key);
      if (!RETRYABLE.has(response.status)) return response;
      last = response;
    } catch (error) {
      lastError = error;
    }
  }
  if (last) return last;
  throw lastError instanceof Error && lastError.name === "TimeoutError" ? new Error("The AI provider timed out.") : new Error("The AI provider could not be reached.");
}
