import type { McpTool } from "./mcp-client";

// Nexus notifications and announcements, read with the same read-only MCP token as assignments and grades. They
// are where new sources appear (e.g. "Your feedback is ready" linking Mesa's Feedback page), so links in them are
// classified and flagged for import. Only the two list tools are used; delete_notification is never called.
export type MessageLink = { url: string; kind: "mesa_feedback" | "quiz_tool" | "apps_script" | "drive" | "nexus" | "campus_hub" | "link"; label: string };
export type LmsMessage = { kind: "notification" | "announcement"; sourceRecordId: string; title: string; body: string; course: string; postedAt: string | null; links: MessageLink[] };

const READ_TOOLS: Record<string, LmsMessage["kind"]> = { listnotifications: "notification", listannouncements: "announcement" };
const normal = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

export function selectMessageTools(tools: McpTool[]): { tool: McpTool; kind: LmsMessage["kind"] }[] {
  return tools.flatMap((tool) => {
    const kind = READ_TOOLS[normal(tool.name)];
    const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
    return kind && !required.length ? [{ tool, kind }] : [];
  });
}

// The widest window the tool's own schema allows, and nothing guessed: "sinceDays" and "limit" are set to their
// declared maximum when one is declared; "unreadOnly" is left out so read items are included.
export function messageArguments(tool: McpTool): Record<string, unknown> {
  const properties = (tool.inputSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const args: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    if (/^(sinceDays|limit)$/.test(name) && typeof property?.maximum === "number") args[name] = property.maximum;
  }
  return args;
}

const KNOWN_APPS: [RegExp, MessageLink["kind"], string][] = [
  [/script\.google\.com\/.*\/s\/AKfycby7hY7cvkfaykx_0N0RcMNgj9dz3h4bIeG7FJCIusWhQojCINwHz7sbxW0fjIleLX4\//, "mesa_feedback", "Mesa Feedback page"],
  [/script\.google\.com\/.*\/s\/AKfycbyjYBU0i1kl2XdZRllTpimDkZxILMsAFbgQZvCS0VzHFbSebIUwhNIrUxmLe4lPf1bg2A\//, "quiz_tool", "Cohort 4 Quiz Tool"],
];

export function classifyLink(url: string, context = ""): MessageLink {
  for (const [pattern, kind, label] of KNOWN_APPS) if (pattern.test(url)) return { url, kind, label };
  let host = "";
  try { host = new URL(url).hostname; } catch { return { url, kind: "link", label: "Link" }; }
  if (host === "script.google.com") return /feedback/i.test(context) ? { url, kind: "mesa_feedback", label: "Mesa Feedback page" } : { url, kind: "apps_script", label: "Google Apps Script page" };
  if (host === "docs.google.com" || host === "drive.google.com") return { url, kind: "drive", label: "Google Drive file" };
  if (host.endsWith("mesaschool.co.in")) return { url, kind: "nexus", label: "Nexus page" };
  if (/campus-hub/.test(host)) return { url, kind: "campus_hub", label: "Campus Hub" };
  return { url, kind: "link", label: host };
}

const pick = (item: Record<string, unknown>, keys: string[]) => { for (const key of keys) { const value = item[key]; if (typeof value === "string" && value.trim()) return value.trim(); if (typeof value === "number") return String(value); } return ""; };
const URL_PATTERN = /https:\/\/[^\s"'<>)\]]+/g;

// The reply's first list of objects (a bare array, or the first array-valued field), read field by field with the
// common names; an item with neither id nor title nor body is skipped.
export function normalizeMessages(reply: unknown, kind: LmsMessage["kind"]): LmsMessage[] {
  const list = Array.isArray(reply) ? reply : reply && typeof reply === "object" ? Object.values(reply as Record<string, unknown>).find(Array.isArray) ?? [] : [];
  return (list as unknown[]).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const id = pick(item, ["id", "notificationId", "announcementId", "_id"]);
    const title = pick(item, ["title", "subject", "heading", "name"]).slice(0, 400);
    const body = pick(item, ["body", "message", "text", "content", "description"]).slice(0, 8000);
    if (!id && !title && !body) return [];
    const posted = pick(item, ["createdAt", "created_at", "postedAt", "posted_at", "sentAt", "date", "time"]);
    const postedAt = posted && !Number.isNaN(Date.parse(posted)) ? new Date(posted).toISOString() : null;
    const direct = pick(item, ["url", "link", "href", "deepLink", "actionUrl"]);
    const urls = [...new Set([direct, ...(body.match(URL_PATTERN) ?? [])].filter((url) => url.startsWith("https://")).map((url) => url.replace(/[.,;]+$/, "")))].slice(0, 10);
    const course = (typeof item.course === "object" && item.course ? pick(item.course as Record<string, unknown>, ["title", "name"]) : pick(item, ["course", "courseTitle", "courseName"])).slice(0, 200);
    return [{ kind, sourceRecordId: `mesa-lms:${kind}:${id || `${postedAt ?? ""}:${title}`.slice(0, 240)}`, title, body, course, postedAt, links: urls.map((url) => classifyLink(url, `${title} ${body}`)) }];
  });
}

// Links the server cannot follow (they need the member's own Google sign-in), so the dashboard offers a browser read.
export const NEEDS_BROWSER: MessageLink["kind"][] = ["mesa_feedback", "quiz_tool", "apps_script", "campus_hub"];
