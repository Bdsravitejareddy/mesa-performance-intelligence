import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Guest sessions (member-requested; see AGENTS.md). A guest signs in with the shared username and the password held
// only in the server-side GUEST_PASSWORD secret. Each sign-in is its own short-lived auth user, marked in
// server-managed app_metadata (never editable user metadata); every change it makes is undone when it ends.
export const GUEST_USERNAME = "guest";
export const GUEST_EMAIL_DOMAIN = "guest.mesa-performance.invalid";
export const GUEST_HOURS = 2;
export const GUEST_COOKIE = "mesa_guest_until";

// Paths a guest can never reach: anything that leaves the app (LMS, Nexus, Drive, GitHub), accepts AI processing
// on the member's behalf, runs the full refresh, or removes evidence with privileged access (not undoable).
// An entry matches itself and everything under it; one ending in "-" matches any path that starts with it.
const BLOCKED = ["/api/ai-consent", "/api/ai-context", "/api/conversations", "/api/drive-sync", "/api/drive-agent", "/api/github", "/api/lms-sync", "/api/lms",
  "/api/imports/nexus-", "/api/refresh", "/api/cron", "/api/gradings/detach", "/api/assessment-competencies/auto"];
// Erasing a quarantined file is permanent, so it is never a guest action.
const BLOCKED_PATTERNS = [/^\/api\/materials\/[^/]+\/purge$/];

export function guestBlockedPath(pathname: string): boolean {
  return BLOCKED.some((entry) => entry.endsWith("-") ? pathname.startsWith(entry) : pathname === entry || pathname.startsWith(`${entry}/`))
    || BLOCKED_PATTERNS.some((pattern) => pattern.test(pathname));
}

export type GuestClaims = { app_metadata?: { guest?: unknown; guest_until?: unknown } } | null | undefined;

export function guestUntil(claims: GuestClaims): Date | null {
  const meta = claims?.app_metadata;
  if (meta?.guest !== true || typeof meta.guest_until !== "string") return null;
  const until = new Date(meta.guest_until);
  return Number.isNaN(until.getTime()) ? null : until;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

// Constant-time comparison of the username (case-insensitive) and the configured password.
export function guestCredentialsMatch(username: string, password: string, configured: string | undefined): boolean {
  if (!configured) return false;
  const nameOk = timingSafeEqual(digest(username.trim().toLowerCase()), digest(GUEST_USERNAME));
  const passwordOk = timingSafeEqual(digest(password), digest(configured));
  return nameOk && passwordOk;
}

export const clientHash = (forwardedFor: string | null) => createHash("sha256").update(`guest-login:${(forwardedFor ?? "").split(",")[0].trim() || "unknown"}`).digest("hex");

export function newGuestIdentity(now = new Date()): { email: string; until: string } {
  return { email: `guest-${randomUUID()}@${GUEST_EMAIL_DOMAIN}`, until: new Date(now.getTime() + GUEST_HOURS * 3_600_000).toISOString() };
}

const BUCKETS = ["course-files", "evidence-files", "submission-files"];

async function listFolder(admin: SupabaseClient, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 5) return [];
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  const paths: string[] = [];
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    // Folders are listed without an id.
    if (item.id) paths.push(path); else paths.push(...await listFolder(admin, bucket, path, depth + 1));
  }
  return paths;
}

// Undoes a guest's changes, removes files in its own folders and deletes the guest user.
export async function endGuestSession(admin: SupabaseClient, userId: string): Promise<{ reverted: number; skipped: number; files: number }> {
  const { data, error } = await admin.rpc("end_guest_session", { p_user_id: userId });
  if (error) throw new Error("The guest session could not be undone.");
  let files = 0;
  for (const bucket of BUCKETS) {
    const paths = await listFolder(admin, bucket, userId).catch(() => []);
    if (paths.length) { await admin.storage.from(bucket).remove(paths); files += paths.length; }
  }
  await admin.auth.admin.deleteUser(userId).catch(() => null);
  const result = (data ?? {}) as { reverted?: number; skipped?: number };
  return { reverted: result.reverted ?? 0, skipped: result.skipped ?? 0, files };
}

// Ends every guest session past its time (closed tabs never sign out).
export async function endExpiredGuests(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.rpc("expired_guest_sessions");
  const ids = ((data ?? []) as (string | { expired_guest_sessions?: string })[]).map((row) => typeof row === "string" ? row : String(row.expired_guest_sessions ?? "")).filter(Boolean);
  for (const id of ids) await endGuestSession(admin, id).catch(() => null);
  return ids.length;
}
