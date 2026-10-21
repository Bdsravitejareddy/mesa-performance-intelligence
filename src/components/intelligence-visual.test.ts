import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntelligenceVisual } from "./intelligence-visual";

describe("overview intelligence visual", () => {
  it("renders as decorative artwork so it does not interrupt dashboard navigation", () => {
    const markup = renderToStaticMarkup(createElement(IntelligenceVisual));

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('class="intelligence-visual"');
    expect(markup).toContain("<svg");
  });
});
