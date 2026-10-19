export async function requestJsonFromProvider(system: string, user: string): Promise<Record<string, unknown>> {
  if (process.env.AI_DATA_PROCESSING_APPROVED !== "true") throw new Error("AI processing is disabled until excerpt sharing is explicitly approved in server configuration.");
  const apiBase = process.env.AI_API_BASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!apiBase || !apiKey || !model) throw new Error("Configure the server-side AI endpoint, key, and model before requesting an evaluation.");
  const url = new URL(`${apiBase}/chat/completions`);
  if (url.protocol !== "https:") throw new Error("The hosted AI endpoint must use HTTPS.");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`The configured AI provider returned HTTP ${response.status}.`);
  const body = await response.json() as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The AI provider returned no JSON content.");
  try {
    const result: unknown = JSON.parse(content);
    if (result && typeof result === "object" && !Array.isArray(result)) return result as Record<string, unknown>;
  } catch { /* Keep provider response contents out of logs and error messages. */ }
  throw new Error("The AI provider response did not match the required JSON format.");
}
