import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { AppShell } from "./app-shell";

describe("dashboard visual theme", () => {
  it("applies the nature theme to all pages through the shared application shell", () => {
    const markup = renderToStaticMarkup(createElement(AppShell, { demoMode: false, children: createElement("p", null, "Workspace content") }));

    expect(markup).toContain('data-theme="nature"');
    expect(markup).toContain("Workspace content");
  });
});
