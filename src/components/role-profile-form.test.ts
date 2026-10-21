// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoleProfileForm } from "./role-profile-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

describe("role benchmark form", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts with the selected target and separates discovery from reviewed benchmark saving", () => {
    const markup = renderToStaticMarkup(createElement(RoleProfileForm));
    expect(markup).toContain("Senior Technical Product Manager — HealthTech/Healthcare — Singapore");
    expect(markup).toContain("Find public roles");
    expect(markup).toContain("Review fetched role source");
    expect(markup).toContain("Requirements you reviewed (one per line)");
    expect(markup).toContain("LinkedIn results are not imported");
    expect(markup).toContain("Unverified profiles are not used as benchmarks");
  });

  it("sends the reviewed source hash and asks for a fresh review when save-time content changes", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const contentHash = "a".repeat(64);
    const source = { title: "Senior PM", text: "Required: build healthcare products.", canonicalUrl: "https://careers.example.org/roles/senior-pm", pageDate: "2026-10-01T00:00:00Z", retrievedAt: "2026-10-22T10:00:00Z", contentHash, verified: false };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ source }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "The role source changed since review. Reopen and review the updated page before saving." }) });
    vi.stubGlobal("fetch", fetchMock);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(RoleProfileForm)));
    const setValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const sourceUrl = host.querySelector<HTMLInputElement>('input[type="url"]')!;
    await act(async () => setValue(sourceUrl, source.canonicalUrl));
    const review = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Review fetched role source"))!;
    await act(async () => review.click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requirements = host.querySelector("textarea")!;
    await act(async () => setValue(requirements, "build healthcare products"));
    const confirmation = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => confirmation.click());
    const save = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Save reviewed role profile"))!;
    expect(save.disabled).toBe(false);
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const saveBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as { reviewedSource: { canonicalUrl: string; contentHash: string } };
    expect(saveBody.reviewedSource).toEqual({ canonicalUrl: source.canonicalUrl, contentHash });
    expect(host.textContent).toContain("source changed since review");
    expect([...host.querySelectorAll("button")].some((button) => button.textContent?.includes("Review fetched role source"))).toBe(true);
    await act(async () => root.unmount());
  });
});
