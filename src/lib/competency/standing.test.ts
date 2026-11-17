import { describe, expect, it } from "vitest";
import { classifyCompetency, type CompetencyEvidence } from "./classify";
import { bandCounts, projectContext, skillPhrase, summariseSkills } from "./standing";
import { buildLibrary } from "@/lib/roles/library";
import { BUCKET_OF, roleReadiness } from "@/lib/roles/readiness";
import { chooseActivity } from "@/lib/roadmap/prioritise";
import { toRoadmapInput } from "@/lib/roadmap/load";

const now = new Date("2026-11-17T00:00:00Z");
const ev = (id: string, mark: number | null, extra: Partial<CompetencyEvidence> = {}): CompetencyEvidence => ({ submissionId: id, assessmentId: id, assessmentTitle: id, course: "Course", mark, feedback: "", date: "2026-10-01", source: "Mesa LMS", mappingSource: "official_rubric", granularity: "whole_assessment", stakes: "graded", ...extra });

describe("headline counts come from the counted list", () => {
  it("counts only what was counted, and the list shown separates what was set aside", () => {
    // 3 high, 2 mid-range and 2 low rows in all; one high is practice and one low an older version of a regraded assessment.
    const result = classifyCompetency([
      ev("A", 90), ev("B", 88), ev("P", 95, { stakes: "practice", mappingSource: "practice_test" }), ev("C", 70), ev("D", 72), ev("E", 50), ev("F", 40, { date: "2026-09-01" }), ev("F", 75, { date: "2026-10-05", submissionId: "F2" }),
    ], now);
    const tally = bandCounts(result.why.counted);
    expect(result.state).toBe("conflicting");
    expect(result.headline).toBe(`${tally.high} high, ${tally.middle} mid-range and ${tally.low} low result${tally.low > 1 ? "s" : ""}`);
    expect(tally).toEqual({ high: 2, middle: 3, low: 1 });
    expect(result.why.evidence.length - result.why.counted.length).toBe(2);
  });
});

describe("skills summary", () => {
  const entry = (id: string, name: string, rows: CompetencyEvidence[]) => ({ id, name, assessment: classifyCompetency(rows, now) });
  const entries = [
    entry("product.metrics", "Product metrics", [ev("M1", 90, { evidenceKind: "ai_grade" }), ev("M2", 91, { evidenceKind: "ai_grade" })]),
    entry("business.strategy", "Strategy", [ev("S1", 90), ev("S2", 92)]),
    entry("learning.knowledge_transfer", "Knowledge transfer", [ev("K1", 50), ev("K2", 40)]),
    entry("communication.persuasion", "Persuasion", [ev("P1", 92)]),
    entry("technical.python", "Python", []),
    entry("execution.operations", "Operations", [ev("O1", 70)]),
  ];
  const summary = summariseSkills(entries);

  it("matches the states listed below it and puts officially marked strengths first", () => {
    expect(summary.strengths).toEqual([{ id: "business.strategy", name: "Strategy", aiOnly: false }, { id: "product.metrics", name: "Product metrics", aiOnly: true }]);
    expect(summary.gaps.map((item) => item.name)).toEqual(["Knowledge transfer"]);
    expect(summary.emerging.map((item) => item.name)).toEqual(["Persuasion"]);
    expect(summary.unknown).toBe(entries.filter((item) => item.assessment.state === "insufficient_evidence").length);
    expect(summary.strengths.length + summary.gaps.length + summary.mixed.length + summary.emerging.length + summary.unknown).toBeLessThanOrEqual(summary.total);
  });

  it("gives project use as context only for the matching technical skill", () => {
    expect(projectContext("technical.python", [{ name: "Python", projects: 11 }, { name: "TypeScript", projects: 20 }])).toEqual({ language: "Python", projects: 11 });
    expect(projectContext("business.strategy", [{ name: "Python", projects: 11 }])).toBeNull();
  });

  it("keeps acronyms in capitals mid-sentence and words roadmap items to match the skill's state", () => {
    expect(skillPhrase("AI")).toBe("AI");
    expect(skillPhrase("Systems understanding")).toBe("systems understanding");
    const operations = { ...entries[5], domain: "Execution", description: "", domain_key: "execution", domain_name: "Execution", sort_order: 1, mappedAssessments: 1 };
    expect(operations.assessment.headline).toBe("One mid-range result");
    const activity = chooseActivity(toRoadmapInput(operations), true);
    expect(activity.title).not.toMatch(/weakness/i);
    expect(activity.title).toMatch(/second marked piece of work on operations/);
    expect(chooseActivity({ ...toRoadmapInput(operations), state: "emerging", name: "AI" }, true).title).toBe("Show AI again in a different course or context");
  });
});

describe("career readiness counts", () => {
  it("lists exactly the requirements its summary counts, in three buckets that add up", () => {
    for (const role of buildLibrary()) {
      const readiness = roleReadiness(role, new Map([["technical.ai", { state: "conflicting" as const, name: "AI" }], ["technical.python", { state: "emerging" as const, name: "Python" }]]), [{ competencyId: "leadership.ownership", status: "attested" }]);
      expect(readiness.skills.length).toBe(readiness.skillRequirements);
      expect(readiness.evidenced + readiness.gaps + readiness.unknown).toBe(readiness.skillRequirements);
      expect(readiness.skills.filter((item) => BUCKET_OF[item.status] === "shown").length).toBe(readiness.evidenced);
      expect(readiness.skills.filter((item) => BUCKET_OF[item.status] === "mixed").length).toBe(readiness.gaps);
      expect(readiness.skills.reduce((sum, item) => sum + item.askedBy, 0) + readiness.unmapped.length + readiness.eligibility.length).toBe(readiness.requirements.length);
    }
  });
});
