import { describe, expect, it } from "vitest";
import { parseCriterionScores } from "@/lib/feedback/criteria";
import { guestBlockedPath } from "@/lib/guest";
import { courseKey, feedbackText, parseFeedbackAssessment, recordId, toHundred, type FeedbackAssessment } from "./mesa-feedback";

const mrs2Data = { course: "Data Driven Decision Making", title: "MRS 2 · Data", term: "Term 1", score: 17.65, max: 20,
  criteria: [{ label: "Data cleaning L0", score: 1.97, max: 2 }, { label: "Data competency L2", score: 1.98, max: 3 }, { label: "BMQ L5", score: 3.6, max: 4 }],
  sections: [{ title: "L5 · BMQ", lines: [{ label: "Computation", status: "partly", detail: "Key figure not computed." }], wentWell: [], improve: [], nextSteps: [], notes: [] }] };

describe("Mesa Feedback page import", () => {
  it("keeps the score out of its maximum and converts it like LMS marks", () => {
    expect(toHundred(17.65, 20)).toBe(88.25);
    expect(toHundred(20.1, 33.3)).toBe(60.36);
    expect(toHundred(25, 33.3)).toBe(75.08);
  });
  it("matches page course titles to workspace titles without faculty names or plurals", () => {
    expect(courseKey("AI and its Applications")).toBe(courseKey("AI and its Application"));
    expect(courseKey("Data Driven Decision Making")).toBe(courseKey("Data Driven Decision Making with Prof. Vinay Sharma"));
    expect(courseKey("Power of Communication")).not.toBe(courseKey("AI and its Application"));
  });
  it("rejects impossible scores and incomplete criteria", () => {
    expect(parseFeedbackAssessment({ ...mrs2Data, score: 21 })).toHaveProperty("error");
    expect(parseFeedbackAssessment({ ...mrs2Data, criteria: [{ label: "", score: 1, max: 2 }] })).toHaveProperty("error");
    expect(parseFeedbackAssessment({ ...mrs2Data, course: "" })).toHaveProperty("error");
  });
  it("writes feedback the criterion parser reads, labelled with its source", () => {
    const item = parseFeedbackAssessment(mrs2Data) as FeedbackAssessment;
    const stored = feedbackText(item, "2026-11-05");
    expect(stored).toMatch(/^Mesa Feedback page — Term 1, MRS 2 · Data: 17.65\/20 \(read 2026-11-05\)\./);
    expect(stored).toContain("Partly: Computation — Key figure not computed.");
    expect(parseCriterionScores(stored).map((criterion) => criterion.label)).toEqual(["Data cleaning L0", "Data competency L2", "BMQ L5"]);
  });
  it("gives a stable record id so reading the page again updates rather than duplicates", () => {
    expect(recordId(mrs2Data)).toBe(recordId({ ...mrs2Data, course: "Data Driven Decision Making with Prof. Vinay Sharma" }));
    expect(recordId(mrs2Data)).not.toBe(recordId({ ...mrs2Data, title: "MRS 1 · Data" }));
  });
  it("is never reachable by a guest", () => expect(guestBlockedPath("/api/imports/mesa-feedback")).toBe(true));
});
