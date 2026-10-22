// Helpers for the member-approved capture of Nexus assignment pages (see AGENTS.md). Pure functions only.

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MIME = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;
export type FileFormat = keyof typeof MIME;

// A submitted file is only fetched from Nexus's own signed storage path for this assignment.
export function submittedFileUrl(raw: string, assignmentId: string): URL | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "storage.googleapis.com" || url.username || url.password || url.port) return null;
  const prefix = `/mesa_tech_assets/mesa-lms/submissions/${assignmentId}/`;
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId) || !url.pathname.startsWith(prefix) || url.pathname.includes("..")) return null;
  return url;
}

// The object path identifies the file without the expiring signature, so it is safe to store.
export const storedSourceId = (url: URL) => `gcs:${url.pathname}`;

export function driveFileId(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || !/^(docs|drive)\.google\.com$/.test(url.hostname)) return null;
  const match = /\/(?:spreadsheets|document|presentation|file|forms)\/d\/([A-Za-z0-9_-]{10,200})/.exec(url.pathname) ?? (url.pathname === "/open" ? [null, url.searchParams.get("id")] : null);
  const id = match?.[1];
  return id && /^[A-Za-z0-9_-]{10,200}$/.test(id) ? id : null;
}

// Format from the file's own bytes and name: PDF has its signature; Office files are ZIP containers.
export function detectFormat(name: string, bytes: Uint8Array): FileFormat | null {
  const extension = name.split(".").at(-1)?.toLowerCase();
  const isPdf = new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (isPdf) return "pdf";
  if (!isZip) return null;
  return extension === "pptx" || extension === "docx" || extension === "xlsx" ? extension : null;
}

export type PageCapture = { status: string; submittedAt: string | null; timing: string | null; isGroup: boolean; submittedBy: string | null; members: string[]; capturedAt: string };

export function cleanCapture(value: unknown): PageCapture {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const text = (item: unknown, max = 200) => (typeof item === "string" && item.trim() ? item.trim().slice(0, max) : null);
  return {
    status: text(row.status, 40) ?? "unknown",
    submittedAt: text(row.submittedAt, 80),
    timing: text(row.timing, 40),
    isGroup: row.isGroup === true,
    submittedBy: text(row.submittedBy, 120),
    members: Array.isArray(row.members) ? row.members.map((member) => text(member, 120)).filter((member): member is string => Boolean(member)).slice(0, 20) : [],
    capturedAt: new Date().toISOString(),
  };
}
