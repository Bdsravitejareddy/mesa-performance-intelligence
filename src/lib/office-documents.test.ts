import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractDocxPages, extractXlsxSheets } from "./office-documents";

async function docx(body: string) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

describe("Word extraction", () => {
  it("reads paragraphs, tables and images, splitting at page breaks", async () => {
    const pages = await extractDocxPages(await docx(`${p("Zepto async assignment")}${p("Customer &amp; market")}<w:tbl><w:tr><w:tc>${p("Metric")}</w:tc><w:tc>${p("Value")}</w:tc></w:tr><w:tr><w:tc>${p("AOV")}</w:tc><w:tc>${p("₹420")}</w:tc></w:tr></w:tbl><w:p><w:r><w:br w:type="page"/></w:r></w:p>${p("Appendix")}<w:p><w:r><w:drawing/></w:r></w:p>`));
    expect(pages).toEqual([
      { pageNumber: 1, text: "Zepto async assignment\nCustomer & market", tables: [[["Metric", "Value"], ["AOV", "₹420"]]], hasVisuals: false },
      { pageNumber: 2, text: "Appendix", tables: [], hasVisuals: true },
    ]);
  });

  it("splits long unbroken documents into sections", async () => {
    const pages = await extractDocxPages(await docx(p("x".repeat(8000))));
    expect(pages.map((page) => page.text.length)).toEqual([3500, 3500, 1000]);
  });

  it("rejects archives that are not Word documents", async () => {
    const zip = new JSZip();
    zip.file("other.xml", "<x/>");
    await expect(extractDocxPages(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/Invalid Word document/);
  });
});

describe("Excel extraction", () => {
  it("turns each sheet into a table page using shared strings", async () => {
    const zip = new JSZip();
    zip.file("xl/workbook.xml", `<workbook><sheets><sheet name="Orders" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/></Relationships>`);
    zip.file("xl/sharedStrings.xml", `<sst><si><t>City</t></si><si><t>Orders</t></si><si><r><t>Banga</t></r><r><t>lore</t></r></si></sst>`);
    zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>2500</v></c></row></sheetData></worksheet>`);
    zip.file("xl/worksheets/sheet2.xml", `<worksheet><sheetData/></worksheet>`);
    zip.file("xl/worksheets/_rels/sheet1.xml.rels", `<Relationships><Relationship Id="d1" Type="drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
    const pages = await extractXlsxSheets(await zip.generateAsync({ type: "uint8array" }));
    expect(pages).toEqual([{ pageNumber: 1, text: "Sheet: Orders\nCity | Orders\nBangalore | 2500", tables: [[["City", "Orders"], ["Bangalore", "2500"]]], hasVisuals: true }]);
  });
});
