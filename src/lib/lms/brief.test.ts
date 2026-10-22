import { describe, expect, it } from "vitest";
import { briefFromAssignment } from "./brief";

describe("assignment brief", () => {
  it("keeps the task text and material names, never links", () => {
    const brief = briefFromAssignment({ description: "Read the book and answer five questions.", instructions: "Submit a Word file.", materials: [{ title: "Question sheet", link: "https://docs.google.com/x" }, { fileName: "rubric.pdf" }, { link: "https://example.com" }], submissionType: "file", maxMarks: 20 });
    expect(brief).toContain("Read the book and answer five questions.");
    expect(brief).toContain("Attached materials: Question sheet; rubric.pdf; linked resource");
    expect(brief).toContain("Maximum marks: 20");
    expect(brief).not.toContain("https://");
  });
  it("is empty when the reply has no task text", () => {
    expect(briefFromAssignment(null)).toBe("");
  });
});

import { attachedMaterialFiles } from "./brief";
describe("attached assignment materials", () => {
  const id = "9263a57b-13a4-4b40-abca-fb20477f9307";
  it("reads only files in this assignment's Nexus storage path", () => {
    const files = attachedMaterialFiles({ materials: [
      { fileName: "Question Paper.docx", link: `https://storage.googleapis.com/mesa_tech_assets/mesa-lms/assignments/${id}/materials/a.docx?Signature=x` },
      { fileName: "Other.pdf", link: "https://storage.googleapis.com/mesa_tech_assets/mesa-lms/assignments/other/materials/b.pdf" },
      { fileName: "Sheet", link: "https://docs.google.com/spreadsheets/d/abc" },
    ] }, id);
    expect(files.map((file) => file.name)).toEqual(["Question Paper.docx"]);
  });
});
