// Which pages of an imported document the platform cannot read well enough on its own.

export type ReviewPage = { page_number: number; extracted_text: string; table_data: unknown; has_visuals: boolean };
export type PageAttention = { pageNumber: number; reason: "no_text" | "image_heavy"; textPreview: string };
export type MaterialReviewSummary = { pages: number; withText: number; withVisuals: number; noText: number; attention: PageAttention[] };

// Slides whose only text is a title or caption carry most of their meaning in the image.
export const IMAGE_HEAVY_TEXT_LIMIT = 120;

function hasTable(value: unknown): boolean {
  return Array.isArray(value) && value.some((table) => Array.isArray(table) && table.some((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim())));
}

export function summarizeMaterialPages(pages: ReviewPage[]): MaterialReviewSummary {
  const attention: PageAttention[] = [];
  let withText = 0;
  let withVisuals = 0;
  let noText = 0;
  for (const page of [...pages].sort((a, b) => a.page_number - b.page_number)) {
    const text = page.extracted_text.replace(/\s+/g, " ").trim();
    const readable = text.length > 0 || hasTable(page.table_data);
    if (readable) withText += 1; else noText += 1;
    if (page.has_visuals) withVisuals += 1;
    if (!readable) attention.push({ pageNumber: page.page_number, reason: "no_text", textPreview: "" });
    else if (page.has_visuals && text.length < IMAGE_HEAVY_TEXT_LIMIT) attention.push({ pageNumber: page.page_number, reason: "image_heavy", textPreview: text.slice(0, 160) });
  }
  return { pages: pages.length, withText, withVisuals, noText, attention };
}
