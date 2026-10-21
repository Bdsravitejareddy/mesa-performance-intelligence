import { resolveProviderSettings } from "./settings";

export async function requestJsonFromProvider(system: string, user: string): Promise<Record<string, unknown>> {
  if (process.env.AI_DATA_PROCESSING_APPROVED !== "true") throw new Error("AI processing is disabled until excerpt sharing is explicitly approved in server configuration.");
  const { base: apiBase, key: apiKey, model, kind } = resolveProviderSettings();
  if (!apiBase || !apiKey || !model) throw new Error("Configure the server-side AI endpoint, key, and model before requesting an evaluation.");
  const url = new URL(`${apiBase}/chat/completions`);
  if (url.protocol !== "https:") throw new Error("The hosted AI endpoint must use HTTPS.");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    // Gemini's OpenAI-compatible endpoint documents schema-based structured output but not plain JSON mode,
    // so it relies on the JSON-only instruction and tolerant parsing below.
    body: JSON.stringify({ model, temperature: 0.1, ...(kind === "gemini" ? {} : { response_format: { type: "json_object" } }), messages: [{ role: "system", content: `${system}\nRespond with a single JSON object and nothing else.` }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`The configured AI provider returned HTTP ${response.status}.`);
  const body = await response.json() as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The AI provider returned no JSON content.");
  try {
    const result: unknown = JSON.parse(stripJsonFence(content));
    if (result && typeof result === "object" && !Array.isArray(result)) return result as Record<string, unknown>;
  } catch { /* Keep provider response contents out of logs and error messages. */ }
  throw new Error("The AI provider response did not match the required JSON format.");
}

// Some providers wrap JSON in a Markdown code fence even when asked not to.
export function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}
