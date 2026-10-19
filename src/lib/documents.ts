import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  tables: string[][][];
  hasVisuals: boolean;
};

export type ExtractedSlide = {
  slideNumber: number;
  text: string;
  tables: string[][][];
  hasVisuals: boolean;
};

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
});

export async function extractPdfPages(bytes: Uint8Array | ArrayBuffer): Promise<ExtractedPage[]> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const loadingTask = getDocument({ data, verbosity: 0 });
  const document = await loadingTask.promise;
  const pages: ExtractedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let previousY: number | undefined;
      const text = content.items
        .filter((item) => "str" in item)
        .map((item) => {
          if (!("str" in item)) return "";
          const y = item.transform[5];
          const separator = previousY === undefined ? "" : Math.abs(previousY - y) > 2 ? "\n" : " ";
          previousY = y;
          return `${separator}${item.str}`;
        })
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .trim();

      pages.push({ pageNumber, text, tables: [], hasVisuals: false });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function collectText(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!node || typeof node !== "object") return [];

  const values: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "a:t") {
      values.push(...asArray(value as string | string[]).filter((text) => typeof text === "string"));
    } else if (value && typeof value === "object") {
      values.push(...collectText(value));
    }
  }
  return values;
}

function findNodes(node: unknown, name: string): unknown[] {
  if (Array.isArray(node)) return node.flatMap((child) => findNodes(child, name));
  if (!node || typeof node !== "object") return [];

  const found: unknown[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === name) found.push(...asArray(value));
    if (value && typeof value === "object") found.push(...findNodes(value, name));
  }
  return found;
}

function extractTables(slide: unknown): string[][][] {
  return findNodes(slide, "a:tbl").map((table) =>
    findNodes(table, "a:tr").map((row) =>
      findNodes(row, "a:tc").map((cell) => collectText(cell).join(" ").trim()),
    ),
  );
}

export async function extractPptxSlides(bytes: Uint8Array | ArrayBuffer): Promise<ExtractedSlide[]> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const archive = await JSZip.loadAsync(data);
  const slideEntries = Object.keys(archive.files)
    .map((path) => ({ path, match: path.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
    .filter((entry): entry is { path: string; match: RegExpMatchArray } => Boolean(entry.match))
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));

  const slides: ExtractedSlide[] = [];
  for (const entry of slideEntries) {
    const xml = await archive.file(entry.path)!.async("string");
    const parsed = xmlParser.parse(xml);
    const text = collectText(parsed).map((value) => value.trim()).filter(Boolean).join("\n").trim();
    const tables = extractTables(parsed);
    slides.push({
      slideNumber: Number(entry.match[1]),
      text,
      tables,
      hasVisuals: findNodes(parsed, "p:pic").length > 0 || findNodes(parsed, "p:graphicFrame").length > 0,
    });
  }

  if (slides.length === 0) throw new Error("No readable slides were found in this PPTX file.");
  return slides;
}
