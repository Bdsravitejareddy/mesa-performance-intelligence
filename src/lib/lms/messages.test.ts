import { describe, expect, it } from "vitest";
import { classifyLink, messageArguments, normalizeMessages, selectMessageTools } from "./messages";

const tools = [
  { name: "list_notifications", inputSchema: { type: "object", properties: { unreadOnly: { type: "boolean" }, sinceDays: { type: "integer", maximum: 90 }, limit: { type: "integer", maximum: 100 } } } },
  { name: "list_announcements", inputSchema: { type: "object", properties: { sinceDays: { type: "integer" }, query: { type: "string" } } } },
  { name: "delete_notification", inputSchema: { type: "object", properties: { notificationId: { type: "string" } }, required: ["notificationId"] } },
  { name: "list_assignments", inputSchema: { type: "object", properties: {} } },
];

describe("Nexus notifications and announcements", () => {
  it("uses only the two list tools, never delete_notification", () => {
    expect(selectMessageTools(tools).map((item) => item.tool.name)).toEqual(["list_notifications", "list_announcements"]);
  });
  it("asks for the widest window the schema declares, without guessing or filtering to unread", () => {
    expect(messageArguments(tools[0])).toEqual({ sinceDays: 90, limit: 100 });
    expect(messageArguments(tools[1])).toEqual({});
  });
  it("finds links in a notification and recognises the Feedback page and Quiz Tool", () => {
    const [message] = normalizeMessages({ notifications: [{ id: "n1", title: "Your Term 1 feedback is ready", body: "Read it here: https://script.google.com/a/pg27.mesaschool.co/macros/s/AKfycby7hY7cvkfaykx_0N0RcMNgj9dz3h4bIeG7FJCIusWhQojCINwHz7sbxW0fjIleLX4/exec.", createdAt: "2026-11-04T09:00:00Z" }] }, "notification");
    expect(message).toMatchObject({ sourceRecordId: "mesa-lms:notification:n1", postedAt: "2026-11-04T09:00:00.000Z" });
    expect(message.links).toEqual([{ url: "https://script.google.com/a/pg27.mesaschool.co/macros/s/AKfycby7hY7cvkfaykx_0N0RcMNgj9dz3h4bIeG7FJCIusWhQojCINwHz7sbxW0fjIleLX4/exec", kind: "mesa_feedback", label: "Mesa Feedback page" }]);
    expect(classifyLink("https://script.google.com/a/macros/pg27.mesaschool.co/s/AKfycbyjYBU0i1kl2XdZRllTpimDkZxILMsAFbgQZvCS0VzHFbSebIUwhNIrUxmLe4lPf1bg2A/exec").kind).toBe("quiz_tool");
    expect(classifyLink("https://docs.google.com/spreadsheets/d/abc").kind).toBe("drive");
  });
  it("reads a bare list and skips empty items", () => {
    const messages = normalizeMessages([{ id: 7, title: "Class moved", message: "Room 4" }, {}], "announcement");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: "announcement", body: "Room 4", links: [] });
  });
});
