import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { inflateRawSync } from "node:zlib";
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

export type DocumentExtractionLimits = {
  maxPages?: number;
  maxTextCharacters?: number;
  timeoutMs?: number;
  maxZipEntries?: number;
  maxUncompressedBytes?: number;
  maxEntryBytes?: number;
  maxSlideBytes?: number;
};

type ZipBudget = Pick<DocumentExtractionLimits, "maxPages" | "maxZipEntries" | "maxUncompressedBytes" | "maxEntryBytes" | "maxSlideBytes">;
type ZipEntry = { name: string; compressedSize: number; uncompressedSize: number; method: number; localHeaderOffset: number };

function withDeadline<T>(work: Promise<T>, deadline: number | undefined, label: string): Promise<T> {
  if (deadline === undefined) return work;
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error(`Document extraction exceeded the ${label} time limit.`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Document extraction exceeded the ${label} time limit.`)), remaining); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

/** Inspect classic ZIP central-directory declarations before JSZip inflates any entry. */
function validateZipBudget(bytes: Uint8Array, limits: ZipBudget): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minEocdLength = 22;
  const searchStart = Math.max(0, bytes.byteLength - 65_557);
  let eocd = -1;
  for (let offset = bytes.byteLength - minEocdLength; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("Invalid or unsupported PPTX archive directory.");
  const disk = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);
  if (disk !== 0 || directoryDisk !== 0 || diskEntries !== entryCount || entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff || eocd + minEocdLength + commentLength > bytes.byteLength) {
    throw new Error("Invalid or unsupported PPTX archive directory.");
  }
  if (limits.maxZipEntries !== undefined && entryCount > limits.maxZipEntries) throw new Error("PPTX archive exceeds the ZIP entry count limit.");
  if (directoryOffset + directorySize > eocd || directoryOffset + directorySize > bytes.byteLength) throw new Error("Invalid PPTX archive directory bounds.");

  let cursor = directoryOffset;
  let totalUncompressed = 0;
  let slideCount = 0;
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > directoryOffset + directorySize || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Invalid PPTX archive directory entry.");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const entryCommentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const entryEnd = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (entryEnd > directoryOffset + directorySize || diskStart !== 0 || uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || (flags & 1) !== 0 || (method !== 0 && method !== 8)) {
      throw new Error("Invalid or unsupported PPTX archive entry.");
    }
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name.endsWith("/")) {
      if (uncompressedSize !== 0) throw new Error("Invalid PPTX directory entry size.");
    } else {
      const isSlideXml = /^ppt\/slides\/slide\d+\.xml$/i.test(name);
      if (method === 0 && compressedSize !== uncompressedSize) throw new Error("Invalid PPTX stored-entry size.");
      if (limits.maxEntryBytes !== undefined && uncompressedSize > limits.maxEntryBytes) throw new Error("PPTX archive entry exceeds the per-entry size limit.");
      if (isSlideXml && limits.maxSlideBytes !== undefined && uncompressedSize > limits.maxSlideBytes) throw new Error("PPTX slide XML exceeds the per-slide size limit.");
      totalUncompressed += uncompressedSize;
      if (limits.maxUncompressedBytes !== undefined && totalUncompressed > limits.maxUncompressedBytes) throw new Error("PPTX archive exceeds the uncompressed size limit.");
      entries.push({ name, compressedSize, uncompressedSize, method, localHeaderOffset });
      if (isSlideXml) {
        slideCount += 1;
        if (limits.maxPages !== undefined && slideCount > limits.maxPages) throw new Error("PPTX archive exceeds the slide limit.");
      }
    }
    cursor = entryEnd;
  }
  if (cursor !== directoryOffset + directorySize) throw new Error("Invalid PPTX archive directory length.");
  return entries;
}

function extractBoundedPptxSlides(bytes: Uint8Array, limits: DocumentExtractionLimits, deadline: number | undefined): ExtractedSlide[] {
  const entries = validateZipBudget(bytes, limits);
  const slideEntries = entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name)).sort((left, right) => Number(left.name.match(/slide(\d+)/i)?.[1]) - Number(right.name.match(/slide(\d+)/i)?.[1]));
  if (limits.maxPages !== undefined && slideEntries.length > limits.maxPages) throw new Error("PPTX archive exceeds the slide limit.");
  if (!slideEntries.length) throw new Error("No readable slides were found in this PPTX file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let totalTextCharacters = 0;
  let totalActualBytes = 0;
  const slides: ExtractedSlide[] = [];
  for (const entry of slideEntries) {
    if (deadline !== undefined && Date.now() >= deadline) throw new Error("Document extraction exceeded the PPTX extraction time limit.");
    const localOffset = entry.localHeaderOffset;
    if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Invalid PPTX local file header.");
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const filenameLength = view.getUint16(localOffset + 26, true);
    const extraLength = view.getUint16(localOffset + 28, true);
    const contentOffset = localOffset + 30 + filenameLength + extraLength;
    const contentEnd = contentOffset + entry.compressedSize;
    if ((localFlags & 1) !== 0 || localMethod !== entry.method || contentEnd > bytes.byteLength || contentOffset < localOffset + 30) throw new Error("Invalid PPTX local file entry.");
    const localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + filenameLength));
    if (localName !== entry.name) throw new Error("PPTX local and central directory names differ.");
    const compressed = bytes.subarray(contentOffset, contentEnd);
    const maxOutputBytes = /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name) ? (limits.maxSlideBytes ?? limits.maxEntryBytes ?? entry.uncompressedSize) : (limits.maxEntryBytes ?? entry.uncompressedSize);
    const content = entry.method === 0
      ? compressed
      : new Uint8Array(inflateRawSync(compressed, { maxOutputLength: maxOutputBytes }));
    if (content.byteLength !== entry.uncompressedSize) throw new Error("PPTX entry expanded beyond its declared size.");
    totalActualBytes += content.byteLength;
    if (limits.maxUncompressedBytes !== undefined && totalActualBytes > limits.maxUncompressedBytes) throw new Error("PPTX archive exceeds the uncompressed size limit.");
    const parsed = xmlParser.parse(decoder.decode(content));
    const text = collectText(parsed).map((value) => value.trim()).filter(Boolean).join("\n").trim();
    totalTextCharacters += text.length;
    if (limits.maxTextCharacters !== undefined && totalTextCharacters > limits.maxTextCharacters) throw new Error("Document exceeds the extracted text limit.");
    const tables = extractTables(parsed);
    const slideNumber = Number(entry.name.match(/slide(\d+)/i)?.[1]);
    slides.push({ slideNumber, text, tables, hasVisuals: findNodes(parsed, "p:pic").length > 0 || findNodes(parsed, "p:graphicFrame").length > 0 });
    if (deadline !== undefined && Date.now() >= deadline) throw new Error("Document extraction exceeded the PPTX extraction time limit.");
  }
  return slides;
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
});

export async function extractPdfPages(bytes: Uint8Array | ArrayBuffer, limits: DocumentExtractionLimits = {}): Promise<ExtractedPage[]> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const loadingTask = getDocument({ data, verbosity: 0 });
  const deadline = limits.timeoutMs === undefined ? undefined : Date.now() + limits.timeoutMs;
  let document: Awaited<typeof loadingTask.promise>;
  try {
    document = await withDeadline(loadingTask.promise, deadline, "PDF extraction");
  } catch (error) {
    await loadingTask.destroy();
    throw error;
  }
  if (limits.maxPages !== undefined && document.numPages > limits.maxPages) {
    await loadingTask.destroy();
    throw new Error("PDF exceeds the page limit.");
  }
  const pages: ExtractedPage[] = [];
  let totalTextCharacters = 0;

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await withDeadline(document.getPage(pageNumber), deadline, "PDF extraction");
      let previousY: number | undefined;
      const parts: string[] = [];
      try {
        if (limits.maxTextCharacters === undefined) {
          // Keep the legacy importer path unchanged unless a caller explicitly requests a bound.
          const content = await withDeadline(page.getTextContent(), deadline, "PDF extraction");
          for (const item of content.items) {
            if ("str" in item) {
              const y = item.transform[5];
              const separator = previousY === undefined ? "" : Math.abs(previousY - y) > 2 ? "\n" : " ";
              previousY = y;
              parts.push(`${separator}${item.str}`);
            }
          }
        } else {
          const reader = page.streamTextContent().getReader();
          let streamDone = false;
          try {
            while (true) {
              const { done, value } = await withDeadline(reader.read(), deadline, "PDF extraction");
              if (done) { streamDone = true; break; }
              for (const item of value.items) {
                if ("str" in item) {
                  const y = item.transform[5];
                  const separator = previousY === undefined ? "" : Math.abs(previousY - y) > 2 ? "\n" : " ";
                  previousY = y;
                  const part = `${separator}${item.str}`;
                  totalTextCharacters += part.length;
                  if (totalTextCharacters > limits.maxTextCharacters) throw new Error("Document exceeds the extracted text limit.");
                  parts.push(part);
                }
              }
            }
          } finally {
            // Cancellation stops PDF.js from parsing the rest of a page once its text budget is exceeded.
            if (!streamDone) await reader.cancel(new Error("PDF text extraction stopped at its configured limit.")).catch(() => undefined);
            reader.releaseLock();
          }
        }
        const text = parts.join("")
          .replace(/[ \t]+\n/g, "\n")
          .trim();

        pages.push({ pageNumber, text, tables: [], hasVisuals: false });
      } finally {
        page.cleanup();
      }
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

export async function extractPptxSlides(bytes: Uint8Array | ArrayBuffer, limits: DocumentExtractionLimits = {}): Promise<ExtractedSlide[]> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const deadline = limits.timeoutMs === undefined ? undefined : Date.now() + limits.timeoutMs;
  if (Object.keys(limits).length > 0) return extractBoundedPptxSlides(data, limits, deadline);
  const archive = await withDeadline(JSZip.loadAsync(data), deadline, "PPTX extraction");
  const slideEntries = Object.keys(archive.files)
    .map((path) => ({ path, match: path.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
    .filter((entry): entry is { path: string; match: RegExpMatchArray } => Boolean(entry.match))
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  if (limits.maxPages !== undefined && slideEntries.length > limits.maxPages) throw new Error("PPTX archive exceeds the slide limit.");

  const slides: ExtractedSlide[] = [];
  let totalTextCharacters = 0;
  for (const entry of slideEntries) {
    if (deadline !== undefined && Date.now() >= deadline) throw new Error("Document extraction exceeded the PPTX extraction time limit.");
    const xml = await withDeadline(archive.file(entry.path)!.async("string"), deadline, "PPTX extraction");
    const parsed = xmlParser.parse(xml);
    const text = collectText(parsed).map((value) => value.trim()).filter(Boolean).join("\n").trim();
    totalTextCharacters += text.length;
    if (limits.maxTextCharacters !== undefined && totalTextCharacters > limits.maxTextCharacters) throw new Error("Document exceeds the extracted text limit.");
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
