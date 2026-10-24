import { describe, expect, it } from "vitest";
import { parseQuizToolRow, summariseQuizTool } from "./quiz-tool";

describe("Cohort 4 Quiz Tool", () => {
  it("sums distinct questions per course and overall", () => {
    const summary = summariseQuizTool([
      { course: "Data 102", term: "Term 2", session: "Session 2", correct: 7, total: 10, shown: "14 / 20", missed: [] },
      { course: "Data 102", term: "Term 2", session: "Session 3", correct: 4, total: 5, shown: "", missed: [] },
      { course: "Finance", term: "Term 2", session: "Session 1", correct: 3, total: 5, shown: "", missed: [] },
    ]);
    expect(summary).toMatchObject({ correct: 14, total: 20, percent: 70, sessions: 3 });
    expect(summary.courses).toEqual([{ course: "Data 102", correct: 11, total: 15, percent: 73.3, sessions: 2 }, { course: "Finance", correct: 3, total: 5, percent: 60, sessions: 1 }]);
  });
  it("has no percentage when nothing is recorded", () => {
    expect(summariseQuizTool([])).toEqual({ correct: 0, total: 0, percent: null, sessions: 0, courses: [] });
  });
  it("rejects impossible counts and keeps missed questions brief", () => {
    expect(parseQuizToolRow({ course: "Data 102", session: "S2", correct: 11, total: 10 })).toHaveProperty("error");
    expect(parseQuizToolRow({ course: "", session: "S2", correct: 1, total: 2 })).toHaveProperty("error");
    const row = parseQuizToolRow({ course: " Data 102 ", session: "Session 2", correct: "7", total: "10", missed: [{ question: "Net change after +40% then −25%?", yourAnswer: "+10%", correctAnswer: "+5%" }, { question: "" }] });
    expect(row).toMatchObject({ course: "Data 102", correct: 7, total: 10, missed: [{ yourAnswer: "+10%", correctAnswer: "+5%" }] });
  });
});
