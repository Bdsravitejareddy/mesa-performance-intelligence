import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CriterionBreakdown } from "./criterion-breakdown";

describe("criterion breakdown", () => {
  it("renders parsed criteria and the hidden-gap note", () => {
    const html = renderToStaticMarkup(createElement(CriterionBreakdown, { feedback: "Market sizing 2/10 | Strategy 9/10 | Communication 9/10", overall: 85 }));
    expect(html).toContain("read from the official feedback text");
    expect(html).toContain("Market sizing");
    expect(html).toContain("hides a lower criterion: Market sizing (2/10)");
  });
  it("renders nothing without a breakdown", () => {
    expect(renderToStaticMarkup(createElement(CriterionBreakdown, { feedback: "Nice work.", overall: 90 }))).toBe("");
  });
});
