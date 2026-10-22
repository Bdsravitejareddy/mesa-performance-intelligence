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
