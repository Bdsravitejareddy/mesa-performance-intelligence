// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsightSummary } from "./insight-summary";

describe("whole-workspace insight summary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not offer generation until both provider readiness and current consent are reported", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: true, consented: false, providerHost: "ai.example", model: "model-x", retentionNotice: "No training; 30-day retention.", disclosureVersion: "v1" }) }));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(InsightSummary, { demoMode: false })));
    await act(async () => Promise.resolve());
    expect(host.textContent).toContain("Review AI processing");
    expect(host.textContent).toContain("No training; 30-day retention.");
    expect(host.textContent).toContain("Accept and enable AI summaries");
    expect(host.querySelector('button[aria-label="Generate or refresh summary"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it("renders source-linked workspace sections and offers explicit refresh only with current consent", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: true, consented: true, providerHost: "ai.example", model: "model-x", retentionNotice: "30-day retention." }) }));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(InsightSummary, { demoMode: false })));
    await act(async () => Promise.resolve());
    expect(host.textContent).toContain("No workspace summary has been generated yet.");
    expect(host.querySelector('button[aria-label="Generate or refresh summary"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("shows generated workspace strengths, improvement, action, source labels, and confidence", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const workspace = {
      strengths: [{ title: "Consistent methods", detail: "Two reviewed assignments used valid calculations.", sourceRefs: ["E1"], confidence: "high" }],
      improvements: [{ title: "State assumptions", detail: "Assumptions were missing in two answers.", sourceRefs: ["E1"], confidence: "medium", whatStudentDid: "Reported results without assumptions.", courseExpectation: "State relevant assumptions.", whyIncomplete: "The denominator is unclear.", illustrativeExample: "Illustrative: state the denominator and date range.", rubricAlignment: "Analytical reasoning criterion.", professionalApplication: "Makes product metrics comparable." }],
      actions: [{ title: "Add assumptions", detail: "Include a short assumptions block.", sourceRefs: ["E1"], confidence: "medium" }],
    };
    const fetchStub = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ configured: true, consented: true, providerHost: "ai.example", model: "model-x", retentionNotice: "30-day retention." }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summary: workspace, sources: [{ key: "E1", label: "Finance Notes v3, page 8" }], sampleCounts: { marks: 2, feedback: 2, evaluations: 2 } }) });
    vi.stubGlobal("fetch", fetchStub);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(InsightSummary, { demoMode: false })));
    await act(async () => Promise.resolve());
    await act(async () => (host.querySelector('button[aria-label="Generate or refresh summary"]') as HTMLButtonElement).click());
    expect(host.textContent).toContain("What you do well");
    expect(host.textContent).toContain("What to improve next");
    expect(host.textContent).toContain("What to do now");
    expect(host.textContent).toContain("Finance Notes v3, page 8");
    expect(host.textContent).toContain("Confidence: high");
    expect(host.textContent).toContain("Repeated patterns are separated from one-assessment observations.");
    await act(async () => root.unmount());
  });

  it("explains missing provider configuration without offering AI actions", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configured: false, consented: false, providerHost: null, model: null, retentionNotice: null }) }));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(InsightSummary, { demoMode: false })));
    await act(async () => Promise.resolve());
    expect(host.textContent).toContain("AI summaries are not configured");
    expect(host.querySelector('button[aria-label="Generate or refresh summary"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
