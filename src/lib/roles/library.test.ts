import { describe, expect, it } from "vitest";
import { buildLibrary, mapRequirement, overlapWithPrimary } from "./library";

describe("role library", () => {
  it("builds primary roles first, then cross-compatible roles, from the researched postings", () => {
    const library = buildLibrary();
    expect(library.slice(0, 2).map((role) => [role.name, role.tier])).toEqual([["Senior Technical Product Manager", "primary"], ["Forward Deployed Engineer", "primary"]]);
    expect(library.filter((role) => role.tier === "cross").map((role) => role.name)).toContain("Head of Product");
    for (const role of library) expect(role.postings.every((posting) => posting.url.startsWith("https://"))).toBe(true);
  });

  it("maps skills to competencies and keeps eligibility requirements out of skill gaps", () => {
    expect(mapRequirement("Proficiency in programming languages such as Python, SQL, Javascript")).toEqual({ competencyIds: ["technical.sql", "technical.python"], eligibility: false });
    expect(mapRequirement("8+ years of direct product management experience").eligibility).toBe(true);
    expect(mapRequirement("Ruthlessly prioritize features and ensure priorities are clearly communicated").competencyIds[0]).toBe("product.prioritisation");
  });

  it("measures how much a cross role overlaps with the primary targets", () => {
    const library = buildLibrary();
    const head = library.find((role) => role.name === "Head of Product")!;
    const overlap = overlapWithPrimary(head, library);
    expect(overlap.share).toBeGreaterThan(0);
    expect(overlap.shared.every((id) => head.competencies.includes(id))).toBe(true);
  });
});

describe("role readiness", async () => {
  const { roleReadiness, importanceFromLibrary } = await import("./readiness");
  const library = buildLibrary();
  const fde = library.find((role) => role.name === "Forward Deployed Engineer")!;

  it("uses competency evidence, treats claims as unverified and keeps eligibility separate", () => {
    const competencies = new Map([["technical.python", { state: "development_area" as const, name: "Python" }], ["technical.ai", { state: "demonstrated_strength" as const, name: "AI" }]]);
    const readiness = roleReadiness(fde, competencies, [{ competencyId: "leadership.ownership", status: "claimed" }]);
    const byQuote = (text: string) => readiness.requirements.find((item) => item.quote.startsWith(text))!;
    expect(byQuote("1+ years").status).toBe("eligibility");
    expect(byQuote("Strong coder").status).toBe("gap");
    expect(byQuote("Production experience with LLMs").status).toBe("demonstrated");
    expect(byQuote("High agency").status).toBe("unverified_claim");
    expect(readiness.eligibility.length).toBeGreaterThan(0);
  });

  it("ranks primary-role requirements above cross-role ones", () => {
    const importance = importanceFromLibrary(library, new Map());
    expect(importance.get("technical.python")?.stage).toBe("primary");
    expect(importance.get("technical.python")!.weight).toBe(3);
  });
});
