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
