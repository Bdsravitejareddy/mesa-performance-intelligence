import { describe, expect, it } from "vitest";
import { courseStanding } from "./course-standing";
import type { LibraryRole } from "@/lib/roles/library";

const role = (name: string, ids: string[]): LibraryRole => ({ key: name, name, tier: "primary", postings: [], competencies: ids, requirements: ids.map((id) => ({ quote: id, kind: "required" as never, competencyIds: [id], eligibility: false, source: { employer: "", title: "", url: "" } })) });

describe("course standing", () => {
  const input = {
    courses: [{ id: "sell", title: "Selling", term: "Term 1" }, { id: "data", title: "Data", term: "Term 1" }, { id: "brand", title: "Branding", term: "Term 1" }],
    assessments: [{ id: "s1", course_id: "sell", official_max_mark: 100 }, { id: "d1", course_id: "data", official_max_mark: 100 }, { id: "d2", course_id: "data", official_max_mark: 100 }, { id: "b1", course_id: "brand", official_max_mark: 100 }],
    marks: [{ assessment_id: "s1", mark: 70, weight: 100 }, { assessment_id: "d1", mark: 60, weight: 100 }],
    gradings: [],
    mappings: [{ assessment_id: "s1", competency_id: "comm" }, { assessment_id: "d1", competency_id: "data" }, { assessment_id: "d1", competency_id: "sql" }],
    roles: [role("PM", ["data", "sql", "strategy", "roadmap", "comm", "x1", "x2", "x3", "x4", "x5", "x6"])],
  };

  it("reads 70 in a supporting course as enough and 60 in a core course as needing work", () => {
    const rows = courseStanding(input);
    const selling = rows.find((row) => row.courseId === "sell")!;
    const data = rows.find((row) => row.courseId === "data")!;
    expect(selling.roles[0]).toMatchObject({ relevance: "supporting", threshold: 65, verdict: "sufficient" });
    expect(data.roles[0]).toMatchObject({ relevance: "core", threshold: 75, verdict: "needs_work" });
    expect(data.demonstratedShare).toBe(0.5);
  });

  it("never invents a standing: unmarked courses are not yet evidenced", () => {
    const branding = courseStanding(input).find((row) => row.courseId === "brand")!;
    expect(branding).toMatchObject({ standing: null, basis: "none", demonstratedShare: 0 });
    expect(branding.roles[0].verdict).toBe("not_yet_evidenced");
  });

  it("falls back to the AI grade, labelled as such, when no official mark exists", () => {
    const rows = courseStanding({ ...input, gradings: [{ assessment_id: "b1", ai_score: 82 }] });
    expect(rows.find((row) => row.courseId === "brand")).toMatchObject({ standing: 82, basis: "ai" });
  });
});

describe("mixed standing", () => {
  it("uses the official mark where released and the AI grade elsewhere", () => {
    const rows = courseStanding({ courses: [{ id: "e", title: "E101", term: "Term 1" }], assessments: [{ id: "mid", course_id: "e", official_max_mark: 100 }, { id: "end", course_id: "e", official_max_mark: 100 }], marks: [{ assessment_id: "mid", mark: 51, weight: 100 }], gradings: [{ assessment_id: "end", ai_score: 83.5 }, { assessment_id: "mid", ai_score: 40 }], mappings: [], roles: [] });
    expect(rows[0]).toMatchObject({ standing: 67.3, basis: "mixed", official: 51 });
  });
});
