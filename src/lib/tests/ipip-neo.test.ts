import { describe, expect, it } from "vitest";
import { NEO_TRAITS, neoOnDashboardScale, neoSummaryText, parseIpipNeo, standoutFacets, type IpipNeo } from "./ipip-neo";

// An invented result in the text layout of an IPIP-NEO result PDF (split ligatures, hyphen breaks, lines broken mid-score).
const facetScores: Record<string, [string, number, number][]> = {
  openness: [["Imagination", 40, 90], ["Artistic Interests", 30, 40], ["Emotionality", 35, 70], ["Adventurousness", 33, 60], ["Intellect", 44, 95], ["Liberalism", 28, 55]],
  conscientiousness: [["Self-Efficacy", 40, 70], ["Orderliness", 30, 40], ["Dutifulness", 42, 80], ["Achievement-Striving", 41, 75], ["Self-Discipline", 38, 66], ["Cautiousness", 35, 60]],
  extraversion: [["Friendliness", 36, 60], ["Gregariousness", 25, 30], ["Assertiveness", 40, 85], ["Activity Level", 33, 60], ["Excitement-Seeking", 30, 50], ["Cheerfulness", 38, 70]],
  agreeableness: [["Trust", 35, 60], ["Morality", 40, 70], ["Altruism", 44, 45], ["Cooperation", 30, 40], ["Modesty", 28, 45], ["Sympathy", 36, 65]],
  neuroticism: [["Anxiety", 20, 30], ["Anger", 18, 25], ["Depression", 15, 20], ["Self-Consciousness", 22, 40], ["Immoderation", 25, 50], ["Vulnerability", 14, 20]],
};
const label = (raw: number, max: number) => (raw / max >= 0.7 ? "↑ High" : raw / max <= 0.4 ? "↓ Low" : "→ Average");
function report(options: { breakSum?: boolean } = {}) {
  const lines = ["=== page 1", "Your five traits.", "Taken November 15, 2026 Time spent 31:05 IPIP-NEO-300",
    "Compared with Men , 25–34", "Compared with 35,332 people who answered the same 120 statements online, mostly in English (Johnson, 2014). These are not o ffi cial norms."];
  for (const trait of NEO_TRAITS) {
    const facets = facetScores[trait.key];
    const total = facets.reduce((sum, [, raw]) => sum + raw, 0) + (options.breakSum && trait.key === "openness" ? 5 : 0);
    lines.push(`=== page ${lines.length}`, trait.label.replace("to", "To"), `${label(total, 300)} ${total} of 300 · ${Math.round(((total - 60) / 240) * 100)} %`, " Higher than 70% of men aged", "25 – 34");
    for (const [name, raw, percentile] of facets) lines.push(` ${name.replace("-", "- ")} ${label(raw, 50)}`, `${raw} of`, "50", ` Higher than ${percentile}% of men aged`, "25 – 34", "High scorers on this scale fi nd arti fi cial things.");
  }
  return lines.join("\n");
}

describe("reading an IPIP-NEO result", () => {
  it("reads five traits, thirty facets, the norm group and the date, and checks totals against facets", () => {
    const result = parseIpipNeo(report()) as IpipNeo;
    expect(result.form).toBe("IPIP-NEO-300");
    expect(result.takenOn).toBe("2026-11-15");
    expect(result.durationSeconds).toBe(31 * 60 + 5);
    expect(result.normGroup).toBe("Men aged 25–34");
    expect(result.facets).toHaveLength(30);
    expect(result.consistent).toBe(true);
    expect(result.facets.find((facet) => facet.name === "Self-Efficacy")).toMatchObject({ raw: 40, max: 50, percentile: 70, trait: "conscientiousness" });
    expect(result.traits.conscientiousness.raw).toBe(226);
  });

  it("puts the result on the dashboard's 1–5 scale, intellect from its Intellect and Imagination facets", () => {
    const scale = neoOnDashboardScale(parseIpipNeo(report()) as IpipNeo);
    expect(scale.conscientiousness).toBe(Math.round((226 / 60) * 100) / 100);
    expect(scale.intellect).toBe(Math.round(((40 + 44) / 20) * 100) / 100);
  });

  it("flags what in the report does not add up rather than correcting it", () => {
    const result = parseIpipNeo(report({ breakSum: true })) as IpipNeo;
    expect(result.consistent).toBe(false);
    expect(result.anomalies.join(" ")).toMatch(/does not equal the sum/);
    // Altruism 44/50 is labelled High yet higher than only 45%.
    expect(result.anomalies.join(" ")).toMatch(/Altruism is reported as high/);
    expect(result.anomalies.join(" ")).toMatch(/120-statement form, not the 300-statement form/);
  });

  it("names facets that break from their trait and summarises for an AI reader", () => {
    const result = parseIpipNeo(report()) as IpipNeo;
    expect(standoutFacets(result).map((facet) => facet.name)).toContain("Intellect");
    expect(neoSummaryText(result)).toMatch(/Conscientiousness: 226\/300/);
  });

  it("refuses text that is not an IPIP-NEO result", () => {
    expect(parseIpipNeo("Lecture 3 slides")).toEqual({ error: expect.stringMatching(/does not look like an IPIP-NEO result/) });
  });
});
