import { describe, expect, it } from "vitest";
import { buildCompetencyMap } from "./map";

const now = new Date("2026-10-22T00:00:00Z");
const competencies = [
  { id: "analytical.numerical_analysis", domain_key: "analytical", domain_name: "Analytical reasoning", name: "Numerical analysis", description: "", sort_order: 1 },
  { id: "business.strategy", domain_key: "business", domain_name: "Business acumen", name: "Strategy", description: "", sort_order: 2 },
];
const courses = [{ id: "c1", title: "Marketing" }];
const assessments = [{ id: "a1", course_id: "c1", title: "Quiz 1" }, { id: "a2", course_id: "c1", title: "Quiz 2" }, { id: "a3", course_id: "c1", title: "Pending case" }];
const submissions = [
  { id: "s1", assessment_id: "a1", official_mark: "90.00", official_feedback: "Clear", official_mark_source: "Mesa Nexus MCP", submitted_at: "2026-10-01T00:00:00Z" },
  { id: "s2", assessment_id: "a2", official_mark: 88, official_feedback: "", official_mark_source: "Mesa Nexus MCP", submitted_at: "2026-10-05T00:00:00Z" },
];

describe("competency map", () => {
  it("groups by domain, classifies from accepted mappings, and leaves unmapped competencies unknown", () => {
    const domains = buildCompetencyMap({
      competencies, courses, assessments, submissions,
      mappings: [
        { assessment_id: "a1", competency_id: "analytical.numerical_analysis", mapping_source: "user_tagged", review_status: "accepted" },
        { assessment_id: "a2", competency_id: "analytical.numerical_analysis", mapping_source: "user_tagged", review_status: "accepted" },
        { assessment_id: "a1", competency_id: "business.strategy", mapping_source: "ai_suggested", review_status: "suggested" },
      ],
    }, now);
    expect(domains.map((domain) => domain.key)).toEqual(["analytical", "business"]);
    const numerical = domains[0].competencies[0];
    expect(numerical.assessment.state).toBe("demonstrated_strength");
    expect(numerical.mappedAssessments).toBe(2);
    expect(numerical.assessment.why.evidence.map((row) => row.mark)).toEqual([90, 88]);
    // The unreviewed AI suggestion is not evidence.
    expect(domains[1].competencies[0].assessment.headline).toBe("Not assessed yet");
  });

  it("represents a mapped assessment without a submission as unscored, not zero", () => {
    const domains = buildCompetencyMap({ competencies, courses, assessments, submissions, mappings: [{ assessment_id: "a3", competency_id: "business.strategy", mapping_source: "user_tagged", review_status: "accepted" }] }, now);
    const strategy = domains[1].competencies[0];
    expect(strategy.assessment.why.evidence[0].mark).toBeNull();
    expect(strategy.assessment.headline).toMatch(/no released mark/);
  });
});
