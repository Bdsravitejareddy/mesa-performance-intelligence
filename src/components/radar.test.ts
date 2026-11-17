import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Radar } from "./radar";
import { SkillsRadar } from "./skills-radar";
import type { SkillView } from "@/lib/profile/skills";

// Invented figures.
const skills: SkillView[] = [
  { domain: "Leadership", marked: 52, markedEvidence: 2, ai: null, holistic: 55 },
  { domain: "Creativity", marked: 80, markedEvidence: 3, ai: null, holistic: 78 },
  { domain: "Analysis & Reasoning", marked: null, markedEvidence: 0, ai: null, holistic: null },
];

describe("radar values", () => {
  it("prints each axis value beside the chart, so a reader needs no hover or disclosure", () => {
    const html = renderToStaticMarkup(createElement(SkillsRadar, { skills: [...skills, { domain: "Communication", marked: 64.4, markedEvidence: 1, ai: null, holistic: 60 }], aiDate: null }));
    expect(html).toContain('<table class="radar-values">');
    // A series with no values at all (the AI view, not run yet) is left out rather than shown as a column of dashes.
    expect(html).toMatch(/<th scope="row">Leadership<\/th><td>52<\/td><td>55<\/td>/);
    expect(html).not.toContain("AI view</th>");
    expect(html).toMatch(/<th scope="row">Creativity<\/th><td>80<\/td>/);
    // A two-line axis label reads as one name; a missing value is a dash, never zero.
    expect(html).toMatch(/<th scope="row">Analysis &amp; Reasoning<\/th><td>—<\/td>/);
    expect(html).toContain("<td>64</td>");
  });

  it("labels the rings with the scale and gives every point a hover title", () => {
    const html = renderToStaticMarkup(createElement(Radar, { title: "Personality", axes: ["Extraversion", "Conscientious-\nness", "Intellect"], max: 5, series: [{ label: "How you answered", tone: "rose", values: [3.42, 4, null] }] }));
    for (const ring of [1, 2, 3, 4, 5]) expect(html).toContain(`class="radar-ring-label">${ring}</text>`);
    expect(html).toContain("<title>How you answered · Conscientiousness: 4 of 5</title>");
    expect(html).toMatch(/<th scope="row">Extraversion<\/th><td>3.4<\/td>/);
  });
});
