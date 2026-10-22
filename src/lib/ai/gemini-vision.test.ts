import { afterEach, describe, expect, it, vi } from "vitest";
import { describeVisualPages, parseDescriptions, visionAvailable } from "./gemini-vision";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;
const ready = env({ AI_DATA_PROCESSING_APPROVED: "true", GEMINI_API_KEY: "g-key" });

describe("Gemini vision", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is unavailable without approval or a Gemini key", () => {
    expect(visionAvailable(env({ GEMINI_API_KEY: "g" })).ok).toBe(false);
    expect(visionAvailable(env({ AI_DATA_PROCESSING_APPROVED: "true", AI_API_BASE_URL: "https://model.example/v1", AI_API_KEY: "k", AI_MODEL: "m" })).ok).toBe(false);
    expect(visionAvailable(ready)).toEqual({ ok: true, model: "gemini-3.8-flash" });
  });

  it("sends inline data to generateContent with the key in a header and JSON output", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ pages: [{ page: 2, readable_text: "Q1 B", visual_description: "Answer grid", colour_meaning: "Green marks the correct option", decorative: false }] }) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await describeVisualPages([{ inlineData: { mimeType: "application/pdf", data: "JVBERi0=" } }], [2], ready);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
    expect(url).not.toContain("g-key");
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.systemInstruction.parts[0].text).toMatch(/untrusted reference data/);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: "application/pdf", data: "JVBERi0=" } });
    expect(result.pages).toEqual([{ page: 2, readableText: "Q1 B", visualDescription: "Answer grid", colourMeaning: "Green marks the correct option", decorative: false }]);
  });

  it("drops pages that were not requested, duplicates and empty entries", () => {
    const pages = parseDescriptions(JSON.stringify({ pages: [{ page: 1, visual_description: "Chart" }, { page: 1, visual_description: "Again" }, { page: 7, visual_description: "Not asked" }, { page: 2 }] }), [1, 2]);
    expect(pages.map((page) => [page.page, page.visualDescription])).toEqual([[1, "Chart"]]);
  });

  it("reports non-JSON replies instead of storing them", () => {
    expect(() => parseDescriptions("Sure! Here is the description.", [1])).toThrow(/JSON/);
  });
});
