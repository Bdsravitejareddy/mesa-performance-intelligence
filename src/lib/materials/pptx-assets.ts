import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

// Visual content of specific PPTX slides, read straight from the archive: embedded pictures and chart data.
// Slide N is ppt/slides/slideN.xml, the same numbering the importer used for stored pages.

export type SlideImage = { mimeType: "image/png" | "image/jpeg" | "image/webp"; data: Uint8Array; name: string };
export type SlideAssets = { slideNumber: number; images: SlideImage[]; chartText: string[]; diagramText: string[] };

const IMAGE_TYPES: Record<string, SlideImage["mimeType"]> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 14 * 1024 * 1024;
// Tiny pictures are bullets, logos and icons, not content worth describing.
const MIN_IMAGE_BYTES = 6 * 1024;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function resolveTarget(target: string): string {
  const parts = ["ppt", "slides", ...target.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part && part !== ".") resolved.push(part);
  }
  return resolved.join("/");
}

function asArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

// Series names, categories and values from a chart part, compacted to short lines.
export function chartSummary(xml: string): string[] {
  const doc = parser.parse(xml);
  const lines: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "c:ser") {
        for (const series of asArray(value as Record<string, unknown> | Record<string, unknown>[])) {
          const name = collectValues((series as Record<string, unknown>)["c:tx"]).join(" ");
          const categories = collectValues((series as Record<string, unknown>)["c:cat"]);
          const values = collectValues((series as Record<string, unknown>)["c:val"]);
          const pairs = values.map((v, i) => `${categories[i] ?? i + 1}: ${v}`).slice(0, 40).join("; ");
          if (pairs) lines.push(`${name || "Series"} — ${pairs}`);
        }
      } else visit(value);
    }
  };
  visit(doc);
  return lines.slice(0, 12);
}

function collectValues(node: unknown): string[] {
  const out: string[] = [];
  const visit = (value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "c:v") for (const item of asArray(child as unknown)) out.push(String(item));
      else visit(child);
    }
  };
  visit(node);
  return out;
}

export async function extractSlideAssets(bytes: Uint8Array, slideNumbers: number[]): Promise<SlideAssets[]> {
  const archive = await JSZip.loadAsync(bytes);
  let total = 0;
  const result: SlideAssets[] = [];
  for (const slideNumber of [...new Set(slideNumbers)].sort((a, b) => a - b)) {
    const rels = archive.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`);
    const assets: SlideAssets = { slideNumber, images: [], chartText: [], diagramText: [] };
    if (rels) {
      const relationships = asArray(parser.parse(await rels.async("string"))?.Relationships?.Relationship as Record<string, string> | Record<string, string>[]);
      for (const rel of relationships) {
        if (rel.TargetMode === "External" || !rel.Target) continue;
        const path = resolveTarget(rel.Target);
        if (rel.Type?.endsWith("/image")) {
          const mimeType = IMAGE_TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
          const file = archive.file(path);
          if (!mimeType || !file) continue; // EMF/WMF/SVG are not accepted as inline images.
          const data = await file.async("uint8array");
          if (data.byteLength < MIN_IMAGE_BYTES || data.byteLength > MAX_IMAGE_BYTES || total + data.byteLength > MAX_TOTAL_IMAGE_BYTES) continue;
          if (assets.images.some((image) => image.name === path)) continue;
          total += data.byteLength;
          assets.images.push({ mimeType, data, name: path });
        } else if (rel.Type?.endsWith("/chart")) {
          const file = archive.file(path);
          if (file) assets.chartText.push(...chartSummary(await file.async("string")));
        } else if (rel.Type?.endsWith("/diagramData")) {
          // SmartArt keeps its words in a separate data part, not in the slide XML.
          const file = archive.file(path);
          if (file) assets.diagramText.push(...[...(await file.async("string")).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1].trim()).filter(Boolean).slice(0, 60));
        }
      }
    }
    result.push(assets);
  }
  return result;
}
