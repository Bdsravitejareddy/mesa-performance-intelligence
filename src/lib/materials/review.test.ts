import { describe, expect, it } from "vitest";
import { summarizeMaterialPages } from "./review";

const page = (page_number: number, extracted_text: string, has_visuals = false, table_data: unknown = []) => ({ page_number, extracted_text, has_visuals, table_data });

describe("material review summary", () => {
  it("flags only blind slides and image-heavy slides, not text slides with a logo", () => {
    const summary = summarizeMaterialPages([
      page(3, "Segmentation, targeting and positioning: choose segments by size, growth, accessibility and fit with capabilities. ".repeat(2), true),
      page(1, "", true),
      page(2, "Market share 2024", true),
      page(4, "Plain text slide with no image at all"),
    ]);
    expect(summary).toMatchObject({ pages: 4, withText: 3, withVisuals: 3, noText: 1 });
    expect(summary.attention).toEqual([
      { pageNumber: 1, reason: "no_text", textPreview: "" },
      { pageNumber: 2, reason: "image_heavy", textPreview: "Market share 2024" },
    ]);
  });

  it("counts a slide with only a table as readable", () => {
    const summary = summarizeMaterialPages([page(1, "", false, [[["Segment", "Share"], ["A", "40%"]]])]);
    expect(summary.noText).toBe(0);
    expect(summary.attention).toEqual([]);
  });
});
