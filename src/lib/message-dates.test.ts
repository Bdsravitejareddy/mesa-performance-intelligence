import { describe, expect, it } from "vitest";
import { datedEvents, type MessageRow } from "./message-dates";

const message = (over: Partial<MessageRow>): MessageRow => ({ id: "m1", kind: "announcement", title: "Notice", body: "", course: "", posted_at: "2026-11-13T10:00:00Z", ...over });

describe("dated events in Nexus messages", () => {
  it("reads deadlines with times, exams on a day, and dates written either way", () => {
    const events = datedEvents([
      message({ id: "a", title: "Sales – Project Submission Instructions", course: "Sales", body: "Project submission Deadline: 19 November 2026, 11:59 PM. Submit your five slide pitch." }),
      message({ id: "b", title: "Operations Mid-Term Written Examination", body: "The Mid-Term Written Examination will be conducted on Tuesday, 17th November 2026. Section A: 11:30 AM – 12:00 PM." }),
      message({ id: "c", title: "Deal Desk C02 Instructions", body: "The deadline for saving both C01 and C02 is Monday, 16 November 2026, 11:59:59 PM IST." }),
      message({ id: "d", title: "Pitch time slots for tomorrow (13th November)" }),
    ]);
    expect(events.map((event) => [event.title, event.kind, event.at, event.allDay])).toEqual([
      ["Pitch time slots for tomorrow (13th November)", "session", "2026-11-13T06:30:00.000Z", true],
      ["Deal Desk C02 Instructions", "deadline", "2026-11-16T18:29:00.000Z", false],
      ["Operations Mid-Term Written Examination", "exam", "2026-11-17T06:30:00.000Z", true],
      ["Sales – Project Submission Instructions", "deadline", "2026-11-19T18:29:00.000Z", false],
    ]);
  });

  it("ignores dates in sentences that name no deadline, exam or session, and repeats of the same message", () => {
    const winners = message({ title: "VC Pitch – Final Round Winners!", body: "Two teams will present at the villa on Tuesday, 17th November. Congratulations!" });
    expect(datedEvents([winners]).map((event) => event.sentence)).toEqual([]);
    const full = message({ id: "x", title: "Quiz on Friday", body: "The quiz is on 20 November 2026." });
    expect(datedEvents([{ ...full, id: "y", kind: "notification", body: "The quiz is on 20 Nov…" }, full])).toHaveLength(1);
  });

  it("puts a date without a year that is long past into next year", () => {
    expect(datedEvents([message({ title: "Exam schedule", body: "The end-term exam is on 8 January.", posted_at: "2026-12-01T00:00:00Z" })])[0].at.slice(0, 10)).toBe("2027-01-08");
  });

  it("skips dates being withdrawn and labels each date by the words before it", () => {
    const events = datedEvents([
      message({ id: "w", title: "Important Update: SQL 101 – Class Cancellation", body: "The SQL 101 sessions scheduled for 13th November 2026 and 14th November 2026 have been cancelled." }),
      message({ id: "r", title: "Deal Desk Instructions", body: "The deadline is Monday, 16 November 2026, 11:59 PM. This replaces the earlier C01 deadline of 15 November." }),
      message({ id: "m", title: "A Hands-On Masterclass", body: "Deadline to fill the form: 6th November 11:59 PM, Friday come prepared to practise in the session on 11th November" }),
      message({ id: "b", title: "Reminder: Exploration Chat", body: "If you have not scheduled a session so far, book one on or before November 20th." }),
    ]);
    expect(events.map((event) => [event.title, event.at.slice(0, 10), event.kind])).toEqual([
      ["A Hands-On Masterclass", "2026-11-06", "deadline"],
      ["A Hands-On Masterclass", "2026-11-11", "session"],
      ["Deal Desk Instructions", "2026-11-16", "deadline"],
      ["Reminder: Exploration Chat", "2026-11-20", "deadline"],
    ]);
  });
});
