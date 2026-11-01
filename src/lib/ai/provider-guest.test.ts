import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/guest-request", () => ({ isGuestRequest: vi.fn(async () => true) }));
import { requestJsonFromProvider } from "./provider";

describe("AI in guest mode", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("never calls the provider for a guest", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true"); vi.stubEnv("GEMINI_API_KEY", "g");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestJsonFromProvider("system", "user")).rejects.toThrow("AI is turned off in guest mode.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
