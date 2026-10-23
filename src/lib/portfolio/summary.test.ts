import { describe, expect, it } from "vitest";
import { parsePortfolioUpload, summarisePortfolio } from "./summary";

describe("portfolio", () => {
  const rows = [
    { source: "github" as const, account: "personal", external_id: "a/meerabot", name: "Meerabot", url: null, data: { description: "Telegram bot", languages: { Python: 10 }, aiPackages: ["google-genai"], commitsByYou: 19, commitMonths: { "2026-09": 19 }, private: true } },
    { source: "github" as const, account: "work", external_id: "b/meerabot-final", name: "meerabot-final", url: null, data: { languages: { Python: 5 }, aiPackages: ["anthropic"], commitsByYou: 2, commitMonths: { "2026-10": 2 } } },
    { source: "github" as const, account: "work", external_id: "b/site", name: "site", url: null, data: { languages: { TypeScript: 5 }, aiPackages: [], commitsByYou: 1, commitMonths: { "2026-10": 1 } } },
    { source: "vercel" as const, account: "v", external_id: "p1", name: "site", url: null, data: { repo: "b/site", production: 4 } },
  ];
  it("counts mirrored projects once and links deployments to repositories", () => {
    const summary = summarisePortfolio(rows);
    expect(summary.projects).toHaveLength(2);
    expect(summary.projects.find((project) => project.name === "Meerabot")).toMatchObject({ commits: 21, accounts: ["personal", "work"], aiPackages: ["google-genai", "anthropic"] });
    expect(summary).toMatchObject({ aiProjects: 1, deployed: 1, activeMonths: 2 });
    expect(summary.providers).toEqual(["Google (Gemini)", "Anthropic (Claude)"]);
  });
  it("accepts only collector files and drops malformed items", () => {
    expect(() => parsePortfolioUpload({ items: [] })).toThrow();
    expect(parsePortfolioUpload({ kind: "mesa-portfolio", items: [{ source: "gitlab", external_id: "x", name: "x", data: {} }, { source: "github", external_id: "a/b", name: "b", url: "javascript:alert(1)", data: {} }] })).toEqual([{ source: "github", account: "github", external_id: "a/b", name: "b", url: null, data: {} }]);
  });
});
