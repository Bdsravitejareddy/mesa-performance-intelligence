export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonError(error: unknown): Response {
  if (!(error instanceof HttpError)) {
    const diagnostic = error instanceof Error ? error : new Error("Unknown non-Error failure");
    const code = "code" in diagnostic && (typeof diagnostic.code === "string" || typeof diagnostic.code === "number")
      ? String(diagnostic.code).slice(0, 40)
      : undefined;
    const message = diagnostic.message
      .slice(0, 500)
      .replace(/\b(sb_(?:secret|publishable|service_role)_[A-Za-z0-9_-]+)\b/gi, "[redacted-key]")
      .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
      .replace(/([?&]resourcekey=)[^&\s]+/gi, "$1[redacted]");
    console.error("[drive-sync] unexpected API error", { name: diagnostic.name, code, message });
  }
  return error instanceof HttpError
    ? jsonResponse({ error: error.message }, error.status)
    : jsonResponse({ error: "Drive sync is temporarily unavailable." }, 503);
}

/** Check actual streamed bytes as well as Content-Length; chunked bodies cannot bypass the cap. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const limit = 512 * 1024;
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)) {
    throw new HttpError(413, "JSON body exceeds 512 KiB.");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(400, "A JSON object is required.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON object is required.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new HttpError(413, "JSON body exceeds 512 KiB.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Not an object");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "A valid JSON object is required.");
  } finally {
    reader.releaseLock();
  }
}
