import { describe, expect, it } from "vitest";
import { buildMonth, deadlineEntries, messageEntries, monthOf, shiftMonth, type CalendarEntry } from "./calendar";

const now = new Date("2026-11-17T06:00:00Z");

describe("calendar of deadlines and events", () => {
  it("defaults to the current India month and moves across years", () => {
    expect(monthOf(null, now)).toBe("2026-11");
    expect(monthOf("2026-13", now)).toBe("2026-11");
    expect(monthOf("2027-02", now)).toBe("2027-02");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("lays the month out in Monday-first weeks and places entries on their India date", () => {
    // 23:30 IST on 20 Nov is 18:00 UTC: it belongs to the 20th in India.
    const entries: CalendarEntry[] = [
      ...deadlineEntries([{ id: "a1", title: "End-Term Exam", course: "Finance", dueAt: "2026-11-20T18:00:00Z", submitted: false }, { id: "a2", title: "Undated", course: "", dueAt: null, submitted: false }]),
      { id: "e1", title: "Ops hackathon", at: "2026-11-27T04:00:00Z", endsAt: "2026-11-28T12:00:00Z", detail: "", source: "member", kind: "hackathon", done: false, link: null },
    ];
    const weeks = buildMonth("2026-11", entries, now);
    expect(weeks[0][0].day).toBe("2026-10-26");
    expect(weeks.at(-1)!.at(-1)!.day).toBe("2026-12-06"); // 30 Nov is a Monday, so a sixth week is needed
    const days = weeks.flat();
    expect(days.find((day) => day.day === "2026-11-20")!.entries.map((entry) => [entry.title, entry.kind])).toEqual([["End-Term Exam", "exam"]]);
    expect(days.filter((day) => day.entries.some((entry) => entry.id === "e1")).map((day) => day.day)).toEqual(["2026-11-27", "2026-11-28"]);
    expect(days.find((day) => day.isToday)!.day).toBe("2026-11-17");
    expect(days.flatMap((day) => day.entries).some((entry) => entry.title === "Undated")).toBe(false);
  });

  it("adds announced deadlines and exams, leaving out one that repeats an assignment on the same day", () => {
    const nexus = deadlineEntries([{ id: "a1", title: "Growth Assignment 1", course: "Growth", dueAt: "2026-11-20T18:29:00Z", submitted: false }]);
    const entries = messageEntries([
      { id: "message:1:2026-11-20", title: "Reminder: Growth Assignment 1 due", course: "Growth with Someone", at: "2026-11-20T18:29:00Z", allDay: false, kind: "deadline", sentence: "" },
      { id: "message:2:2026-11-17", title: "Operations Mid-Term Written Examination", course: "", at: "2026-11-17T06:30:00Z", allDay: true, kind: "exam", sentence: "" },
    ], nexus);
    expect(entries.map((entry) => [entry.title, entry.kind, entry.source, entry.allDay])).toEqual([["Operations Mid-Term Written Examination", "exam", "message", true]]);
  });
});
