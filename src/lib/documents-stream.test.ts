import { afterEach, describe, expect, it, vi } from "vitest";

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument }));

import { extractPdfPages } from "./documents";

afterEach(() => getDocument.mockReset());

describe("bounded PDF text streaming", () => {
  it("cancels an oversized page stream before requesting the remaining page text", async () => {
    let pulls = 0;
    let cancelled = false;
    const page = {
      streamTextContent: () => new ReadableStream({
        pull(controller) {
          pulls += 1;
          if (pulls === 1) {
            controller.enqueue({ items: [{ str: "oversized", transform: [0, 0, 0, 0, 0, 1] }] });
          } else {
            controller.enqueue({ items: [{ str: "the rest of the page", transform: [0, 0, 0, 0, 0, 1] }] });
          }
        },
        cancel() { cancelled = true; },
      }, { highWaterMark: 0 }),
      cleanup: vi.fn(),
    };
    const loadingTask = {
      promise: Promise.resolve({ numPages: 1, getPage: async () => page }),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    getDocument.mockReturnValue(loadingTask);

    await expect(extractPdfPages(new Uint8Array([1]), { maxTextCharacters: 3 }))
      .rejects.toThrow("text limit");
    expect(cancelled).toBe(true);
    expect(pulls).toBe(1);
    expect(page.cleanup).toHaveBeenCalledOnce();
    expect(loadingTask.destroy).toHaveBeenCalledOnce();
  });
});
