import { describe, expect, it } from "vitest";
import { dayOf, groupDue, kindOf, type DueItem } from "./due";
import { normalizeAssignmentRecords } from "./lms/normalize";

const item = (over: Partial<DueItem>): DueItem => ({ id: "x", title: "Assignment", course: "Course", dueAt: null, submitted: false, kind: "assignment", ...over });
// 17 Nov 2026, 10:00 in India (04:30 UTC).
const now = new Date("2026-11-17T04:30:00Z");

describe("due dates", () => {
  it("reads days in Mesa's zone, so late evening UTC is the next Indian day", () => {
    expect(dayOf("2026-11-17T18:00:00Z")).toBe("2026-11-17");
    expect(dayOf("2026-11-17T19:00:00Z")).toBe("2026-11-18");
  });
  it("groups overdue, today, this week and later, and leaves out submitted work", () => {
    const groups = groupDue([
      item({ id: "late", dueAt: "2026-11-15T12:00:00Z" }),
      item({ id: "today", dueAt: "2026-11-17T13:30:00Z" }),
      item({ id: "week", dueAt: "2026-11-22T10:00:00Z" }),
      item({ id: "later", dueAt: "2026-12-10T10:00:00Z" }),
      item({ id: "done", dueAt: "2026-11-17T13:30:00Z", submitted: true }),
      item({ id: "nodate", dueAt: null }),
    ], now);
    expect(groups.overdue.map((row) => row.id)).toEqual(["late"]);
    expect(groups.today.map((row) => row.id)).toEqual(["today"]);
    expect(groups.thisWeek.map((row) => row.id)).toEqual(["week"]);
    expect(groups.later.map((row) => row.id)).toEqual(["later"]);
    expect(groups.unscheduled.map((row) => row.id)).toEqual(["nodate"]);
  });
  it("tells exams and quizzes from assignments by their title", () => {
    expect(kindOf("Mid-Term Assignment")).toBe("exam");
    expect(kindOf("End Term Exam")).toBe("exam");
    expect(kindOf("Week 0 Quiz")).toBe("quiz");
    expect(kindOf("Session 1 Assignment")).toBe("assignment");
  });
  it("reads a deadline from whichever field name Nexus uses, and leaves it unset when absent", () => {
    const [withDeadline] = normalizeAssignmentRecords({ assignments: [{ assignment_id: "a1", title: "Case", course_title: "Course", deadline: "2026-11-17T11:59:00+05:30" }] });
    expect(withDeadline.dueAt).toBe("2026-11-17T06:29:00.000Z");
    const [without] = normalizeAssignmentRecords({ assignments: [{ assignment_id: "a2", title: "Case", course_title: "Course" }] });
    expect(without.dueAt).toBeNull();
  });
});
