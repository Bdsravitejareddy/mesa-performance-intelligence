// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvaluationSummary, type EvaluationSummaryData } from "./evaluation-summary";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { EvaluationAction } from "./evaluation-action";

const summary = {
  strengths: [{ title: "Clear segmentation", detail: "You separated users from buyers.", sourceRefs: ["S1"], confidence: "high" }],
  improvements: [{ title: "Quantify the market", detail: "The market estimate is missing.", sourceRefs: ["S1"], confidence: "medium", whatStudentDid: "Named the segment without sizing it.", courseExpectation: "Support the target market with a defensible estimate.", whyIncomplete: "No market size or assumptions were stated.", illustrativeExample: "Illustrative example: estimate reachable clinics using stated assumptions.", rubricAlignment: "Addresses market and competition.", professionalApplication: "Clarifies product prioritisation." }],
  actions: [{ title: "Add a bottom-up estimate", detail: "State the data and assumptions.", sourceRefs: ["S1"], confidence: "medium" }],
} satisfies EvaluationSummaryData;

describe("assessment evaluation summary", () => {
  afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

  it("renders the three separate summary sections with exact provenance and confidence", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(EvaluationSummary, {
      submissionId: "sub-1", summary, sourceReferences: [{ key: "S1", label: "Market Strategy v2, slide 14" }], sampleCount: 1, documents: [],
    })));
    expect(host.textContent).toContain("What you do well");
    expect(host.textContent).toContain("What to improve next");
    expect(host.textContent).toContain("What to do now");
    expect(host.textContent).toContain("Market Strategy v2, slide 14");
    expect(host.textContent).toContain("Confidence: high");
    expect(host.textContent).toContain("Illustrative example: estimate reachable clinics using stated assumptions.");
    expect(host.textContent).toContain("One assessment observation");
    await act(async () => root.unmount());
  });

  it("shows evidence gaps and safe upload or indexed-course-material actions when LMS attachments are unavailable", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(EvaluationSummary, { submissionId: "sub-2", summary: null, sourceReferences: [], sampleCount: 0, documents: [] })));
    expect(host.textContent).toContain("No evaluation summary is saved for this submission yet.");
    expect(host.textContent).toContain("The LMS connector does not expose submitted attachment content.");
    expect(host.querySelector('a[href="#submission-files-sub-2"]')?.textContent).toContain("Upload a PDF or PPTX");
    expect(host.querySelector('a[href="#submission-files-sub-2"]')?.textContent).toContain("link indexed course material");
    await act(async () => root.unmount());
  });

  it("enables evaluation only after the user accepts a ready provider's current disclosure", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fetchStub = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ configured: true, consented: false, providerHost: "ai.example", model: "model-x", retentionNotice: "30-day retention.", disclosureVersion: "current" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ consented: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "report-1" }) });
    vi.stubGlobal("fetch", fetchStub);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(EvaluationAction, { submissionId: "sub-3", roleProfiles: [], documents: [], reports: [] })));
    await act(async () => Promise.resolve());
    expect(host.textContent).toContain("Provider: ai.example · model: model-x");
    expect(host.querySelector('button[type="button"]')?.textContent).toContain("Accept and enable evaluation");
    expect(host.textContent).not.toContain("Evaluate this submission");
    const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => { checkbox.click(); });
    await act(async () => host.querySelector("button")!.click());
    expect(fetchStub.mock.calls[1]?.[0]).toBe("/api/ai-consent");
    expect(host.textContent).toContain("Evaluate this submission");
    await act(async () => host.querySelector("button")!.click());
    expect(fetchStub.mock.calls[2]?.[0]).toBe("/api/evaluations");
    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
