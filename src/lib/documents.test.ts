import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfPages, extractPptxSlides } from "./documents";

describe("course document extraction", () => {
  it("extracts PDF text with a stable page reference", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    page.drawText("Customer lifetime value", { font: await pdf.embedFont(StandardFonts.Helvetica) });
    const bytes = await pdf.save();

    await expect(extractPdfPages(bytes)).resolves.toEqual([
      expect.objectContaining({ pageNumber: 1, text: expect.stringContaining("Customer lifetime value") }),
    ]);
  });

  it("rejects a PDF exceeding the configured page budget before extracting page content", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage(); pdf.addPage();
    const bytes = await pdf.save();
    await expect(extractPdfPages(bytes, { maxPages: 1 })).rejects.toThrow("page limit");
  });

  it("enforces PDF extraction time and text budgets", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    page.drawText("Bounded text", { font: await pdf.embedFont(StandardFonts.Helvetica) });
    const bytes = await pdf.save();
    await expect(extractPdfPages(bytes.slice(), { timeoutMs: 0 })).rejects.toThrow("time limit");
    await expect(extractPdfPages(bytes.slice(), { maxTextCharacters: 2 })).rejects.toThrow("text limit");
  });

  it("extracts PPTX slide text and table rows while flagging visual content", async () => {
    const deck = new JSZip();
    deck.file(
      "ppt/slides/slide2.xml",
      `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>
        <p:sp><p:txBody><a:p><a:r><a:t>Break-even</a:t></a:r></a:p></p:txBody></p:sp>
        <a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Units</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>500</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl>
        <p:pic><p:nvPicPr /></p:pic>
      </p:spTree></p:cSld></p:sld>`,
    );
    const bytes = await deck.generateAsync({ type: "uint8array" });

    await expect(extractPptxSlides(bytes)).resolves.toEqual([
      {
        slideNumber: 2,
        text: "Break-even\nUnits\n500",
        tables: [[["Units", "500"]]],
        hasVisuals: true,
      },
    ]);
  });

  it("rejects a PPTX whose declared expansion exceeds the budget before inflating slide XML", async () => {
    const deck = new JSZip();
    deck.file("ppt/slides/slide1.xml", "<sld>" + "x".repeat(1024 * 1024) + "</sld>");
    const bytes = await deck.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 9 } });
    await expect(extractPptxSlides(bytes, { maxUncompressedBytes: 512 * 1024 })).rejects.toThrow("uncompressed size limit");
  });

  it("caps actual PPTX expansion when a malicious ZIP understates its central-directory size", async () => {
    const deck = new JSZip();
    deck.file("ppt/slides/slide1.xml", "<sld>" + "x".repeat(2 * 1024 * 1024) + "</sld>");
    const bytes = await deck.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 9 } });
    const forged = bytes.slice();
    const view = new DataView(forged.buffer, forged.byteOffset, forged.byteLength);
    let central = -1;
    for (let offset = forged.length - 46; offset >= 0; offset -= 1) {
      if (view.getUint32(offset, true) === 0x02014b50) { central = offset; break; }
    }
    if (central < 0) throw new Error("Generated ZIP had no central-directory entry.");
    view.setUint32(central + 24, 1, true);
    await expect(extractPptxSlides(forged, { maxEntryBytes: 1024 * 1024 })).rejects.toThrow();
  });

  it("rejects a PPTX exceeding the configured slide count before parsing slide XML", async () => {
    const deck = new JSZip();
    for (let index = 1; index <= 3; index += 1) deck.file(`ppt/slides/slide${index}.xml`, `<sld>${index}</sld>`);
    const bytes = await deck.generateAsync({ type: "uint8array" });
    await expect(extractPptxSlides(bytes, { maxPages: 2 })).rejects.toThrow("slide limit");
  });

  it("enforces PPTX extraction time and text budgets", async () => {
    const deck = new JSZip();
    deck.file("ppt/slides/slide1.xml", "<p:sld xmlns:a=\"a\"><a:t>Bounded text</a:t></p:sld>");
    const bytes = await deck.generateAsync({ type: "uint8array" });
    await expect(extractPptxSlides(bytes, { timeoutMs: 0 })).rejects.toThrow("time limit");
    await expect(extractPptxSlides(bytes, { maxTextCharacters: 2 })).rejects.toThrow("text limit");
  });

  it("rejects archives with excessive central-directory entries", async () => {
    const deck = new JSZip();
    for (let index = 0; index < 3; index += 1) deck.file(`ppt/slides/slide${index + 1}.xml`, `<sld>${index}</sld>`);
    const bytes = await deck.generateAsync({ type: "uint8array" });
    await expect(extractPptxSlides(bytes, { maxZipEntries: 2 })).rejects.toThrow("entry count limit");
  });
});
