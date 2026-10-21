import { describe, expect, it } from "vitest";
import { RULES_VERSION } from "./classify";
import { snapshotChanges, type SnapshotRow } from "./history";
import { buildCompetencyMap, type MappingRow } from "./map";

const now = new Date("2026-10-22T00:00:00Z");
const competencies = [
  { id: "analytical.numerical_analysis", domain_key: "analytical", domain_name: "Analytical reasoning", name: "Numerical analysis", description: "", sort_order: 1 },
  { id: "business.strategy", domain_key: "business", domain_name: "Business acumen", name: "Strategy", description: "", sort_order: 2 },
];
const courses = [{ id: "c1", title: "Marketing" }];
const assessments = [{ id: "a1", course_id: "c1", title: "Quiz 1" }, { id: "a2", course_id: "c1", title: "Quiz 2" }];
const mappings: MappingRow[] = [{ assessment_id: "a1", competency_id: "analytical.numerical_analysis", mapping_source: "user_tagged", review_status: "accepted" }];
const submission = (mark: number) => [{ id: "s1", assessment_id: "a1", official_mark: mark, official_feedback: "", official_mark_source: "LMS", submitted_at: "2026-10-01T00:00:00Z" }];
const map = (mark: number, rows = mappings) => buildCompetencyMap({ competencies, courses, assessments, submissions: submission(mark), mappings: rows }, now);
const latestOf = (rows: SnapshotRow[]) => new Map(rows.map((row) => [row.competency_id, row]));

describe("competency history", () => {
  it("records an initial snapshot only for competencies with evidence", () => {
    const rows = snapshotChanges(map(90), mappings, new Map());
    expect(rows.map((row) => [row.competency_id, row.reason, row.state])).toEqual([["analytical.numerical_analysis", "initial", "emerging"]]);
    expect(rows[0].rules_version).toBe(RULES_VERSION);
  });

  it("appends nothing when nothing changed", () => {
    const first = snapshotChanges(map(90), mappings, new Map());
    expect(snapshotChanges(map(90), mappings, latestOf(first))).toEqual([]);
  });

  it("labels a regraded mark as an evidence change, not growth", () => {
    const first = snapshotChanges(map(90), mappings, new Map());
    const next = snapshotChanges(map(40), mappings, latestOf(first));
    expect(next.map((row) => [row.reason, row.state])).toEqual([["evidence_changed", "insufficient_evidence"]]);
  });

  it("labels a new tag as a mapping change", () => {
    const first = snapshotChanges(map(90), mappings, new Map());
    const moreMappings: MappingRow[] = [...mappings, { assessment_id: "a2", competency_id: "analytical.numerical_analysis", mapping_source: "user_tagged", review_status: "accepted" }];
    expect(snapshotChanges(map(90, moreMappings), moreMappings, latestOf(first))[0].reason).toBe("mapping_changed");
  });

  it("labels a rules change separately from evidence", () => {
    const first = snapshotChanges(map(90), mappings, new Map()).map((row) => ({ ...row, rules_version: "older-rules" }));
    expect(snapshotChanges(map(90), mappings, latestOf(first))[0].reason).toBe("rules_changed");
  });

  it("records the removal of all evidence for a previously assessed competency", () => {
    const first = snapshotChanges(map(90), mappings, new Map());
    const rows = snapshotChanges(map(90, []), [], latestOf(first));
    expect(rows.map((row) => [row.reason, row.headline])).toEqual([["mapping_changed", "Not assessed yet"]]);
  });
});
