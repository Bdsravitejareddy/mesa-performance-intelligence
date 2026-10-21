/** @vitest-environment jsdom */
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmissionForm } from "./submission-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null; container?.remove(); container = null; vi.unstubAllGlobals();
  delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

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

  it("reuses the synchronously saved submission id when attachment is retried", async () => {
    const documentRequests: string[] = [];
    const request = vi.fn(async (url: string) => {
      if (url === "/api/submissions") return { ok: true, json: async () => ({ id: "created-submission" }) };
      documentRequests.push(url);
      return documentRequests.length === 1
        ? { ok: false, json: async () => ({ error: "Temporary extraction error" }) }
        : { ok: true, json: async () => ({ name: "answer.pdf", extractionStatus: "complete" }) };
    });
    vi.stubGlobal("fetch", request);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => { root?.render(createElement(SubmissionForm, { assessmentId: "assessment" })); });
    const form = container.querySelector("form");
    if (!form) throw new Error("Submission form did not render.");
    const material = form.querySelector("select");
    if (!material) throw new Error("Course material selector did not render.");
    material.innerHTML = '<option value="">No material selected</option><option value="material">Course notes</option>';
    material.value = "material";
    await act(async () => { material.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await Promise.resolve(); });
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(request.mock.calls.filter(([url]) => url === "/api/submissions")).toHaveLength(1);
    expect(documentRequests).toEqual(["/api/submissions/created-submission/documents", "/api/submissions/created-submission/documents"]);
  });
});
