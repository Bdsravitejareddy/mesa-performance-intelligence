import { describe, expect, it } from "vitest";
import { cleanCapture, detectFormat, driveFileId, storedSourceId, submittedFileUrl } from "./nexus";

const assignment = "597e35e7-cb28-4735-a957-dc7e8e86816f";
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);

describe("Nexus page capture helpers", () => {
  it("only fetches Nexus's signed storage path for the same assignment and stores no signature", () => {
    const url = submittedFileUrl(`https://storage.googleapis.com/mesa_tech_assets/mesa-lms/submissions/${assignment}/file.pptx?GoogleAccessId=x&Expires=1&Signature=s`, assignment)!;
    expect(storedSourceId(url)).toBe(`gcs:/mesa_tech_assets/mesa-lms/submissions/${assignment}/file.pptx`);
    expect(submittedFileUrl(`https://storage.googleapis.com/mesa_tech_assets/mesa-lms/submissions/other-assignment/file.pptx`, assignment)).toBeNull();
    expect(submittedFileUrl(`https://evil.example/mesa_tech_assets/mesa-lms/submissions/${assignment}/f.pptx`, assignment)).toBeNull();
    expect(submittedFileUrl(`http://storage.googleapis.com/mesa_tech_assets/mesa-lms/submissions/${assignment}/f.pptx`, assignment)).toBeNull();
  });

  it("reads Drive file ids from Sheets, Docs, Slides and Drive links", () => {
    expect(driveFileId("https://docs.google.com/spreadsheets/d/1pK2C03NvNUzM6fLyOSp7yK4pBhClwAOS/edit?gid=1#gid=1")).toBe("1pK2C03NvNUzM6fLyOSp7yK4pBhClwAOS");
    expect(driveFileId("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view")).toBe("1AbCdEfGhIjKlMnOp");
    expect(driveFileId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")).toBe("1AbCdEfGhIjKlMnOp");
    expect(driveFileId("https://forms.gle/abc")).toBeNull();
  });

  it("detects format from bytes, not from the name alone", () => {
    expect(detectFormat("a.pptx", zip)).toBe("pptx");
    expect(detectFormat("a.pdf", new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(detectFormat("a.pdf", zip)).toBeNull();
    expect(detectFormat("a.exe", zip)).toBeNull();
  });

  it("keeps only bounded, plain capture fields", () => {
    const capture = cleanCapture({ status: "Submitted", isGroup: true, submittedBy: "Asmi Jain", members: ["A", 3, "B"], extra: "x" });
    expect(capture).toMatchObject({ status: "Submitted", isGroup: true, submittedBy: "Asmi Jain", members: ["A", "B"] });
    expect(capture).not.toHaveProperty("extra");
  });
});
