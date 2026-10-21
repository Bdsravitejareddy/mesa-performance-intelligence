import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SubmissionForm } from "./submission-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("submission evidence controls", () => {
  it("offers private PDF/PPTX upload, indexed material linking, and direct text entry", () => {
    const markup = renderToStaticMarkup(createElement(SubmissionForm, {
      assessmentId: "assessment",
      courseMaterials: [{ id: "material", name: "Week 2.pdf", sourceKind: "drive", version: 3 }],
    }));
    expect(markup).toContain('type="file"');
    expect(markup).toContain("application/pdf");
    expect(markup).toContain("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(markup).toContain("Week 2.pdf · Drive · v3");
    expect(markup).toContain("Student answer or work notes");
    expect(markup).toContain("Link indexed course material");
  });

  it("shows provenance, extraction status, and a remove control for saved evidence", () => {
    const markup = renderToStaticMarkup(createElement(SubmissionForm, {
      assessmentId: "assessment",
      submissionId: "submission",
      documents: [{ id: "document", name: "Answer.pptx", sourceKind: "upload", extractionStatus: "needs_visual_review", sourceVersion: "sha256:12345678" }],
      courseMaterials: [],
    }));
    expect(markup).toContain("Answer.pptx");
    expect(markup).toContain("Needs visual review");
    expect(markup).toContain("sha256:12345678");
    expect(markup).toContain("Remove evidence");
  });
});
