import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// The text of a short PDF in reading order, a new line wherever the baseline moves. For result reports read by a
// pattern (e.g. an IPIP-NEO result), not for course material, which has its own extractor.
export async function pdfText(bytes: Uint8Array, maxPages = 40): Promise<string> {
  const task = getDocument({ data: bytes, verbosity: 0 });
  try {
    const document = await task.promise;
    if (document.numPages > maxPages) throw new Error(`The PDF has more than ${maxPages} pages.`);
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const content = await (await document.getPage(number)).getTextContent();
      let last: number | undefined;
      const parts: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        parts.push(`${last !== undefined && Math.abs(last - y) > 2 ? "\n" : " "}${item.str}`);
        last = y;
      }
      pages.push(`=== page ${number}\n${parts.join("")}`);
    }
    return pages.join("\n");
  } finally {
    await task.destroy();
  }
}
