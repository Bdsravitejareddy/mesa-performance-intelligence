import { describe, expect, it } from "vitest";
import { GUEST_EMAIL_DOMAIN, clientHash, guestBlockedPath, guestCredentialsMatch, guestUntil, newGuestIdentity } from "./guest";

describe("guest sign-in", () => {
  it("accepts the shared username in any case, only with the configured password", () => {
    expect(guestCredentialsMatch("Guest", "configured-secret", "configured-secret")).toBe(true);
    expect(guestCredentialsMatch(" guest ", "configured-secret", "configured-secret")).toBe(true);
    expect(guestCredentialsMatch("Guest", "Guest", "configured-secret")).toBe(false);
    expect(guestCredentialsMatch("admin", "configured-secret", "configured-secret")).toBe(false);
    expect(guestCredentialsMatch("Guest", "", undefined)).toBe(false);
  });
  it("trusts only server-managed app metadata with a valid end time", () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    expect(guestUntil({ app_metadata: { guest: true, guest_until: until } })?.toISOString()).toBe(until);
    expect(guestUntil({ app_metadata: { guest: "true", guest_until: until } })).toBeNull();
    expect(guestUntil({ app_metadata: { guest: true, guest_until: "soon" } })).toBeNull();
    expect(guestUntil(null)).toBeNull();
  });
  it("blocks paths that leave the app or cannot be undone, and nothing else", () => {
    for (const path of ["/api/lms-sync", "/api/lms", "/api/lms/assignment", "/api/drive-sync/connections/x", "/api/github/connect", "/api/ai-consent", "/api/imports/nexus-submission", "/api/refresh", "/api/cron/refresh", "/api/gradings/detach", "/api/materials/64f95e25-21a2-461f-870a-14079b1f3ae6/purge"]) expect(guestBlockedPath(path)).toBe(true);
    for (const path of ["/api/imports/quiz-tool", "/api/gradings", "/api/rubric", "/api/lmsx", "/competencies", "/api/refreshments", "/api/materials/abc/notes"]) expect(guestBlockedPath(path)).toBe(false);
  });
  it("gives each sign-in its own address and a two-hour end, and hashes the client address", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    const first = newGuestIdentity(now), second = newGuestIdentity(now);
    expect(first.email).not.toBe(second.email);
    expect(first.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)).toBe(true);
    expect(first.until).toBe("2026-11-01T12:00:00.000Z");
    expect(clientHash("203.0.113.9, 10.0.0.1")).toBe(clientHash("203.0.113.9"));
    expect(clientHash("203.0.113.9")).not.toContain("203");
  });
});
