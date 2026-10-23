import JSZip from "jszip";
import type { ExtractedPage } from "./documents";

// Word and Excel parsing for course materials and submissions. Output matches ExtractedPage so the rest of the
// pipeline (indexing, citations, review) treats every format the same way.

const MAX_PART_BYTES = 15 * 1024 * 1024;
const WORD_PAGE_CHARS = 3500;
const MAX_SHEET_ROWS = 300;
const MAX_SHEET_COLUMNS = 40;
const MAX_FORMULA_EXAMPLES = 25;
export const FORMULA_MARKER = "Formulas used:";

const decode = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&amp;/g, "&");
const texts = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "g"))].map((match) => decode(match[1]));

async function readPart(archive: JSZip, path: string): Promise<string | null> {
  const file = archive.file(path);
  if (!file) return null;
  const content = await file.async("string");
  if (content.length > MAX_PART_BYTES) throw new Error("Document part exceeds the size limit.");
  return content;
}

function paragraphText(xml: string): string {
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((paragraph) => texts(paragraph[0].replace(/<w:tab\/>/g, "<w:t>\t</w:t>"), "w:t").join("")).map((line) => line.trim()).filter(Boolean).join("\n");
}

// Pages follow explicit page breaks; long unbroken documents are split into ~3,500-character sections.
export async function extractDocxPages(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const archive = await JSZip.loadAsync(bytes);
  const xml = await readPart(archive, "word/document.xml");
  if (!xml) throw new Error("Invalid Word document: word/document.xml is missing.");
  const body = xml.slice(xml.indexOf("<w:body"), xml.lastIndexOf("</w:body>"));
  const segments = body.split(/<w:br [^>]*w:type="page"[^>]*\/>|<w:lastRenderedPageBreak\/>/);
  const pages: ExtractedPage[] = [];
  for (const segment of segments) {
    const tables = [...segment.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((table) => [...table[0].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((row) => [...row[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((cell) => paragraphText(cell[0]).replace(/\n/g, " "))));
    const text = paragraphText(segment.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, ""));
    const hasVisuals = /<w:drawing|<w:pict|<w:object/.test(segment);
    if (!text && !tables.length && !hasVisuals) continue;
    for (let start = 0; start < Math.max(text.length, 1); start += WORD_PAGE_CHARS) {
      const first = start === 0;
      pages.push({ pageNumber: pages.length + 1, text: text.slice(start, start + WORD_PAGE_CHARS), tables: first ? tables : [], hasVisuals: first && hasVisuals });
    }
  }
  if (!pages.length) throw new Error("Invalid Word document: no readable content.");
  return pages;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  return [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

// Each worksheet becomes one page: its cells as a table and a short text rendering for search.
export async function extractXlsxSheets(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const archive = await JSZip.loadAsync(bytes);
  const workbook = await readPart(archive, "xl/workbook.xml");
  if (!workbook) throw new Error("Invalid Excel workbook: xl/workbook.xml is missing.");
  const rels = (await readPart(archive, "xl/_rels/workbook.xml.rels")) ?? "";
  const targets = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((match) => [match[1], match[2].replace(/^\/?xl\//, "")]));
  const shared = texts(((await readPart(archive, "xl/sharedStrings.xml")) ?? "").replace(/<si>([\s\S]*?)<\/si>/g, (_, inner: string) => `<si>${texts(inner, "t").join("")}</si>`), "si");
  const sheets = [...workbook.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)];
  const pages: ExtractedPage[] = [];
  for (const [, rawName, relId] of sheets) {
    const path = `xl/${targets.get(relId) ?? ""}`;
    const xml = await readPart(archive, path);
    if (!xml) continue;
    const rows: string[][] = [];
    // Formulas are the work in a spreadsheet answer, so they are kept beside the values they produce.
    // Filled-down copies differ only in their cell references, so one example per pattern is kept.
    const formulas = new Map<string, string>();
    const functionNames = new Set<string>();
    const formulaCells = (xml.match(/<f[\s>/]/g) ?? []).length;
    for (const formula of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?<!\/)>(?:(?!<\/c>)[\s\S])*?<f(?:\s[^>]*)?>([^<]+)<\/f>/g)) {
      const body = decode(formula[2]).trim().replace(/_xlfn\.|_xlws\./g, "");
      for (const match of body.matchAll(/([A-Z][A-Z0-9.]*)\(/g)) functionNames.add(match[1]);
      const pattern = body.replace(/\$?[A-Z]{1,3}\$?\d+/g, "#");
      if (formulas.size < MAX_FORMULA_EXAMPLES && !formulas.has(pattern)) formulas.set(pattern, `${formula[1]} =${body}`);
    }
    for (const row of [...xml.matchAll(/<row[ >][\s\S]*?<\/row>/g)].slice(0, MAX_SHEET_ROWS)) {
      const cells: string[] = [];
      for (const cell of row[0].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attributes = cell[1];
        const column = columnIndex(attributes.match(/r="([A-Z]+)\d+"/)?.[1] ?? "A");
        if (column >= MAX_SHEET_COLUMNS) continue;
        const type = attributes.match(/t="([^"]+)"/)?.[1];
        const raw = cell[2] ?? "";
        const value = type === "s" ? shared[Number(texts(raw, "v")[0])] ?? "" : type === "inlineStr" ? texts(raw, "t").join("") : texts(raw, "v")[0] ?? "";
        cells[column] = value.trim();
      }
      if (cells.some(Boolean)) rows.push(Array.from(cells, (value) => value ?? ""));
    }
    const sheetRels = (await readPart(archive, path.replace(/worksheets\//, "worksheets/_rels/") + ".rels")) ?? "";
    const name = decode(rawName);
    if (!rows.length && !/drawing/.test(sheetRels)) continue;
    const functions = [...functionNames];
    const formulaLines = [`${FORMULA_MARKER} ${functions.length ? `${functions.join(", ")} (${formulaCells} formula cell${formulaCells === 1 ? "" : "s"})` : "none"}`, ...[...formulas.values()].map((item) => `Formula ${item}`)];
    pages.push({ pageNumber: pages.length + 1, text: [`Sheet: ${name}`, ...rows.slice(0, 60).map((row) => row.filter(Boolean).join(" | ")), ...formulaLines].join("\n"), tables: rows.length ? [rows] : [], hasVisuals: /drawing/.test(sheetRels) });
  }
  if (!pages.length) throw new Error("Invalid Excel workbook: no readable sheets.");
  return pages;
}
