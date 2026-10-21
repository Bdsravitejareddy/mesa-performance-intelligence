import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJsonFromProvider } from "./provider";

describe("AI provider privacy gate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not make a network request unless excerpt processing is explicitly enabled", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestJsonFromProvider("system", "private answer")).rejects.toThrow("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses non-HTTPS provider endpoints after explicit approval", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_API_BASE_URL", "http://model.example/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "test-model");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestJsonFromProvider("system", "private answer")).rejects.toThrow("HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Gemini provider requests", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("calls the Gemini endpoint with a bearer key, omits JSON mode, and parses fenced JSON", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true");
    vi.stubEnv("AI_API_BASE_URL", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "```json\n{\"ok\":true}\n```" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestJsonFromProvider("system", "user")).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer gemini-test-key");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("gemini-3.8-flash");
    expect(body.response_format).toBeUndefined();
  });
});
