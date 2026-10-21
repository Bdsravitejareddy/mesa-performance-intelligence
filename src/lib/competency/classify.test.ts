import { describe, expect, it } from "vitest";
import { classifyCompetency, type CompetencyEvidence } from "./classify";

const now = new Date("2026-10-22T00:00:00Z");
let counter = 0;
const ev = (mark: number | null, overrides: Partial<CompetencyEvidence> = {}): CompetencyEvidence => {
  counter += 1;
  return { submissionId: `s${counter}`, assessmentId: `a${counter}`, assessmentTitle: `Assessment ${counter}`, course: "Marketing", mark, feedback: "", date: "2026-10-01T00:00:00Z", source: "Mesa Nexus MCP", mappingSource: "user_tagged", granularity: "whole_assessment", ...overrides };
};

describe("competency classification", () => {
  it("treats an unassessed competency as unknown, not weak", () => {
    const result = classifyCompetency([], now);
    expect(result.state).toBe("insufficient_evidence");
    expect(result.confidence).toBe("insufficient");
    expect(result.why.interpretation).toMatch(/not a weakness/);
  });

  it("never treats a missing mark as zero", () => {
    const result = classifyCompetency([ev(null), ev(null)], now);
    expect(result.state).toBe("insufficient_evidence");
    expect(result.headline).toMatch(/no released mark/);
    expect(result.why.limitations.join(" ")).toMatch(/2 mapped assessments have no released mark/);
  });

  it("distinguishes poor evidence from no evidence", () => {
    expect(classifyCompetency([ev(40), ev(50)], now).state).toBe("development_area");
    expect(classifyCompetency([], now).state).toBe("insufficient_evidence");
  });

  it("does not call one low result a development area", () => {
    const result = classifyCompetency([ev(40)], now);
    expect(result.state).toBe("insufficient_evidence");
    expect(result.confidence).toBe("low");
  });

  it("treats one high result as emerging, two as a demonstrated strength", () => {
    expect(classifyCompetency([ev(90)], now).state).toBe("emerging");
    expect(classifyCompetency([ev(90), ev(88)], now).state).toBe("demonstrated_strength");
  });

  it("surfaces conflicting evidence instead of averaging it", () => {
    const result = classifyCompetency([ev(92), ev(45)], now);
    expect(result.state).toBe("conflicting");
  });

  it("counts a regraded or resubmitted assessment once, using the latest record", () => {
    const first = ev(40, { assessmentId: "same", date: "2026-09-01T00:00:00Z" });
    const regrade = ev(90, { assessmentId: "same", date: "2026-10-01T00:00:00Z" });
    const result = classifyCompetency([first, regrade], now);
    expect(result.state).toBe("emerging");
  });

  it("caps confidence at medium for whole-assessment marks", () => {
    const result = classifyCompetency([ev(90), ev(91, { course: "Finance" }), ev(95, { course: "Strategy" })], now);
    expect(result.state).toBe("demonstrated_strength");
    expect(result.confidence).toBe("medium");
    expect(result.why.limitations.join(" ")).toMatch(/whole-assessment marks/);
  });

  it("allows high confidence with criterion-level evidence across courses", () => {
    const result = classifyCompetency([ev(90, { granularity: "criterion" }), ev(91, { course: "Finance" }), ev(95, { course: "Strategy" })], now);
    expect(result.confidence).toBe("high");
  });

  it("reports middle-band results without inventing a strength or weakness", () => {
    expect(classifyCompetency([ev(70), ev(78)], now).state).toBe("meets_expectations");
  });

  it("always explains the benchmark without cohort claims", () => {
    const result = classifyCompetency([ev(90), ev(88)], now);
    expect(result.why.benchmark).toMatch(/No cohort ranking/);
    expect(result.why.evidence).toHaveLength(2);
    expect(result.why.wouldChangeThis.length).toBeGreaterThan(0);
  });

  it("flags stale and single-course evidence as limitations", () => {
    const result = classifyCompetency([ev(90, { date: "2025-01-01T00:00:00Z" }), ev(88, { date: "2025-02-01T00:00:00Z" })], now);
    const text = result.why.limitations.join(" ");
    expect(text).toMatch(/over 180 days old/);
    expect(text).toMatch(/one course/);
  });
});
