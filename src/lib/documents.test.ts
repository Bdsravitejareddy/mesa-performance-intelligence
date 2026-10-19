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
});
