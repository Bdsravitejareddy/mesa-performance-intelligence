import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { chartSummary, extractSlideAssets } from "./pptx-assets";

const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
const chartXml = `<c:chartSpace><c:chart><c:plotArea><c:barChart><c:ser><c:tx><c:strRef><c:strCache><c:pt><c:v>Share</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:strCache><c:pt><c:v>Beauty</c:v></c:pt><c:pt><c:v>Fashion</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt><c:v>31</c:v></c:pt><c:pt><c:v>22</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;

async function deck() {
  const zip = new JSZip();
  zip.file("ppt/slides/slide2.xml", "<p:sld/>");
  zip.file("ppt/slides/_rels/slide2.xml.rels", `<Relationships>${rel("r1", "image", "../media/image1.png")}${rel("r2", "image", "../media/logo.png")}${rel("r3", "chart", "../charts/chart1.xml")}${rel("r4", "image", "../media/vector.emf")}${rel("r5", "hyperlink", "https://example.com")}${rel("r6", "diagramData", "../diagrams/data1.xml")}</Relationships>`);
  zip.file("ppt/diagrams/data1.xml", "<dgm:dataModel><a:t>Awareness</a:t><a:t>Consideration</a:t><a:t>Purchase</a:t></dgm:dataModel>");
  zip.file("ppt/media/image1.png", new Uint8Array(20 * 1024).fill(1));
  zip.file("ppt/media/logo.png", new Uint8Array(500).fill(1));
  zip.file("ppt/media/vector.emf", new Uint8Array(20 * 1024).fill(1));
  zip.file("ppt/charts/chart1.xml", chartXml);
  return zip.generateAsync({ type: "uint8array" });
}

describe("PPTX slide assets", () => {
  it("returns content images and chart data for the requested slides only", async () => {
    const [assets] = await extractSlideAssets(await deck(), [2]);
    expect(assets.slideNumber).toBe(2);
    expect(assets.images.map((image) => [image.name, image.mimeType])).toEqual([["ppt/media/image1.png", "image/png"]]);
    expect(assets.chartText).toEqual(["Share — Beauty: 31; Fashion: 22"]);
    expect(assets.diagramText).toEqual(["Awareness", "Consideration", "Purchase"]);
  });

  it("returns an empty asset set for a slide without relationships", async () => {
    expect(await extractSlideAssets(await deck(), [9])).toEqual([{ slideNumber: 9, images: [], chartText: [], diagramText: [] }]);
  });

  it("summarises chart series", () => {
    expect(chartSummary(chartXml)).toEqual(["Share — Beauty: 31; Fashion: 22"]);
  });
});
