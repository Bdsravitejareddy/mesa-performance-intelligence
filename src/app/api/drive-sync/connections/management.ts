import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import type { DriveConnection, FolderMappingInput } from "@/lib/drive-sync/contracts";
import { HttpError } from "@/lib/drive-sync/http";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const columns = "id,user_id,label,enabled,mapping_revision,last_error,last_scan_at,created_at,drive_folder_mappings(id,drive_folder_id,mode,course_id,root_course_title,enabled)";
type ConnectionRow = {
  id: string; user_id: string; label: string; enabled: boolean; mapping_revision: number;
  last_error?: string | null; last_scan_at?: string | null; created_at?: string;
  drive_folder_mappings: Array<{ id: string; drive_folder_id: string; mode: "course" | "collection"; course_id: string | null; root_course_title: string; enabled: boolean }>;
};

export function isConfigured(): boolean {
  return !isDemoMode() && Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}
export function requireConfigured(): void {
  if (!isConfigured()) throw new HttpError(503, "Drive sync server configuration is unavailable.");
}
export function safeConnection(value: DriveConnection) {
  return {
    id: value.id, userId: value.userId, label: value.label, enabled: value.enabled,
    mappingRevision: value.mappingRevision,
    mappings: value.mappings.map((m) => ({ id: m.id, driveFolderId: m.driveFolderId, mode: m.mode, courseId: m.courseId ?? null, rootCourseTitle: m.rootCourseTitle })),
  };
}
function serialize(row: ConnectionRow) {
  return {
    ...safeConnection({ id: row.id, userId: row.user_id, label: row.label, enabled: row.enabled, mappingRevision: row.mapping_revision,
      mappings: row.drive_folder_mappings.filter((m) => m.enabled).map((m) => ({ id: m.id, driveFolderId: m.drive_folder_id, mode: m.mode, courseId: m.course_id, rootCourseTitle: m.root_course_title })) }),
    lastError: row.last_error ?? null, lastScanAt: row.last_scan_at ?? null, createdAt: row.created_at,
  };
}
export async function listConnections() {
  const client = await createClient();
  const { data, error } = await client.from("drive_connections").select(columns);
  if (error) throw new HttpError(503, "Unable to load Drive connections.");
  return (data as unknown as ConnectionRow[]).map(serialize);
}
export async function accessibleConnection(id: string) {
  if (!uuid.test(id)) throw new HttpError(404, "Drive connection not found.");
  const client = await createClient();
  const { data, error } = await client.from("drive_connections").select(columns).eq("id", id).maybeSingle();
  if (error || !data) throw new HttpError(404, "Drive connection not found.");
  return serialize(data as unknown as ConnectionRow);
}
export function onlyKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some((key) => !keys.includes(key))) throw new HttpError(400, "Unexpected configuration field.");
}
export function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100 || /[\u0000-\u001f]/.test(value)) throw new HttpError(400, "Provide a label of 1–100 characters.");
  return value.trim();
}
function folderId(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "A Drive folder ID or link is required.");
  let id = value.trim();
  if (id.startsWith("https://")) {
    let url: URL;
    try { url = new URL(id); } catch { throw new HttpError(400, "Invalid Drive folder link."); }
    if (url.origin !== "https://drive.google.com" || url.username || url.password) throw new HttpError(400, "Use a Google Drive folder link.");
    const match = /^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    id = match?.[1] ?? (url.pathname === "/open" ? url.searchParams.get("id") ?? "" : "");
  }
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new HttpError(400, "Invalid Drive folder ID.");
  return id;
}
export async function mappings(value: unknown): Promise<FolderMappingInput[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new HttpError(400, "Configure 1–20 Drive folders.");
  const client = await createClient();
  const result: FolderMappingInput[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new HttpError(400, "Invalid folder mapping.");
    onlyKeys(entry, ["id", "driveFolderId", "mode", "courseId", "rootCourseTitle"]);
    const { mode, courseId, rootCourseTitle } = entry;
    if (mode !== "course" && mode !== "collection") throw new HttpError(400, "Choose a course or collection folder.");
    if (typeof rootCourseTitle !== "string" || !rootCourseTitle.trim() || rootCourseTitle.trim().length > 300 || /[\u0000-\u001f]/.test(rootCourseTitle)) throw new HttpError(400, "Provide a course title of 1–300 characters.");
    if (courseId != null) {
      if (mode !== "course" || typeof courseId !== "string" || !uuid.test(courseId)) throw new HttpError(400, "Invalid course mapping.");
      const { data, error } = await client.from("courses").select("id").eq("id", courseId).maybeSingle();
      if (error || !data) throw new HttpError(403, "Course is outside this workspace.");
    }
    const driveFolderId = folderId(entry.driveFolderId);
    if (result.some((m) => m.driveFolderId === driveFolderId)) throw new HttpError(400, "Each Drive folder may be mapped once.");
    result.push({ driveFolderId, mode, courseId: courseId ?? null, rootCourseTitle: rootCourseTitle.trim() });
  }
  return result;
}
