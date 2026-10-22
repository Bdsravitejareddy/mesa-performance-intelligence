import { describe, expect, it } from "vitest";
import { classifyCompetency, type CompetencyEvidence } from "@/lib/competency/classify";
import { buildLibrary } from "@/lib/roles/library";
import { roleReadiness } from "@/lib/roles/readiness";
import { buildEvidenceSwot, compareSwot, type SwotCompetency } from "./swot-evidence";

const now = new Date("2026-10-22T00:00:00Z");
const ev = (assessmentId: string, mark: number | null): CompetencyEvidence => ({ submissionId: `s-${assessmentId}`, assessmentId, assessmentTitle: assessmentId, course: "Data", mark, feedback: "", date: "2026-10-01T00:00:00Z", source: "LMS", mappingSource: "ai_suggested", granularity: "whole_assessment" });
const competency = (id: string, name: string, evidence: CompetencyEvidence[]): SwotCompetency => ({ id, name, domain: "D", assessment: classifyCompetency(evidence, now), mappedAssessments: evidence.length });

describe("evidence-based SWOT", () => {
  const library = buildLibrary();
  const competencies = [
    competency("technical.python", "Python", [ev("q1", 40), ev("q2", 55)]),
    competency("communication.clarity", "Clarity", [ev("q3", 90), ev("q4", 92)]),
    competency("technical.sql", "SQL", []),
    competency("leadership.conflict_resolution", "Conflict resolution", []),
  ];
  const map = new Map(competencies.map((item) => [item.id, { state: item.assessment.state, name: item.name }]));
  const items = buildEvidenceSwot({ competencies, readiness: library.map((role) => roleReadiness(role, map, [])), supportedClaims: [], criterionGaps: [{ assessment: "Mid-term", course: "Data", label: "Market sizing", score: 2, max: 10, overall: 80 }], dataQuality: { syncWarning: null, heldAssignments: 7, describedShare: null } });
  const keys = items.map((item) => item.key);

  it("puts demonstrated shortfalls in weaknesses and never unassessed competencies", () => {
    expect(keys).toContain("weakness:technical.python");
    expect(keys.filter((key) => key.startsWith("weakness:")).some((key) => key.includes("technical.sql") || key.includes("conflict_resolution"))).toBe(false);
    expect(keys).toContain("weakness:criterion:Mid-term:Market sizing");
  });

  it("turns role-required unproven skills into opportunities and role-required gaps into threats", () => {
    expect(keys).toContain("opportunity:proof:technical.sql");
    expect(keys).not.toContain("opportunity:proof:leadership.conflict_resolution");
    expect(keys).toContain("threat:gap:technical.python");
    expect(items.find((item) => item.key === "threat:gap:technical.python")?.impact).toBe("high");
  });

  it("lists strengths with their evidence, eligibility thresholds and data risks", () => {
    expect(items.find((item) => item.key === "strength:communication.clarity")?.evidence.length).toBe(2);
    expect(keys.some((key) => key.startsWith("threat:eligibility:"))).toBe(true);
    expect(keys).toContain("threat:data:held");
  });

  it("reports what changed since the previous snapshot", () => {
    const change = compareSwot([{ key: "weakness:old", title: "Old item" }, { key: "strength:communication.clarity", title: "x" }], items);
    expect(change.removed).toEqual([{ key: "weakness:old", title: "Old item" }]);
    expect(change.added).toContain("weakness:technical.python");
  });
});
