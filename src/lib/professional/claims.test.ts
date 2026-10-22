import { afterEach, describe, expect, it, vi } from "vitest";
import { extractClaims, isQuantified } from "./claims";

describe("professional claims", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("recognises quantified achievements", () => {
    expect(isQuantified("Reduced onboarding time by 40%")).toBe(true);
    expect(isQuantified("Managed a team of 6 people")).toBe(true);
    expect(isQuantified("Strong communicator")).toBe(false);
    expect(isQuantified("Product intern, 2025")).toBe(false);
  });

  it("keeps only known competencies, drops duplicates and defaults unknown types", async () => {
    vi.stubEnv("AI_DATA_PROCESSING_APPROVED", "true"); vi.stubEnv("GEMINI_API_KEY", "g"); vi.stubEnv("AI_API_BASE_URL", ""); vi.stubEnv("AI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ claims: [
      { claim: "Built SQL dashboards used by 30 sales managers", claimType: "achievement", competencyId: "technical.sql" },
      { claim: "built sql dashboards used by 30 sales managers", claimType: "achievement", competencyId: "technical.sql" },
      { claim: "Visionary leader", claimType: "legendary", competencyId: "made.up" },
    ] }) } }] }))));
    const claims = await extractClaims("resume text", [{ id: "technical.sql", name: "SQL", domain: "Technical capability" }]);
    expect(claims).toEqual([
      { claim: "Built SQL dashboards used by 30 sales managers", claimType: "achievement", quantified: true, competencyId: "technical.sql" },
      { claim: "Visionary leader", claimType: "experience", quantified: false, competencyId: null },
    ]);
  });
});
