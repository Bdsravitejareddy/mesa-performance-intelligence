import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompetencyWhy } from "./competency-why";
import { classifyCompetency } from "@/lib/competency/classify";

describe("why this conclusion", () => {
  it("shows evidence, benchmark, interpretation, limitations and what would change it", () => {
    const assessment = classifyCompetency([
      { submissionId: "s1", assessmentId: "a1", assessmentTitle: "Market sizing quiz", course: "Marketing", mark: 90, feedback: "Clear assumptions", date: "2026-10-01T00:00:00Z", source: "Mesa Nexus MCP", mappingSource: "user_tagged", granularity: "whole_assessment" },
      { submissionId: null, assessmentId: "a2", assessmentTitle: "Pending case", course: "Marketing", mark: null, feedback: "", date: null, source: "No submission recorded", mappingSource: "user_tagged", granularity: "whole_assessment" },
    ], new Date("2026-10-22T00:00:00Z"));
    const html = renderToStaticMarkup(createElement(CompetencyWhy, { assessment }));
    for (const text of ["Why this conclusion?", "Market sizing quiz", "90/100", "No released mark", "Benchmark", "No cohort ranking", "Interpretation", "Limitations", "member-tagged", "What would change this", "Clear assumptions"]) expect(html).toContain(text);
  });
});
