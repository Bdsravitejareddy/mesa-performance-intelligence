import "server-only";
import { after } from "next/server";

export const MAX_PASSES = 12;

function origin() {
  const value = process.env.APP_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  try { const url = new URL(value); return url.protocol === "https:" ? url.origin : null; } catch { return null; }
}

// Grading runs on the server in passes of about five minutes. When a pass ends with work left, it starts the
// next pass itself (authenticated with the server-only cron secret), so a backlog finishes without a browser.
export function continueGrading(pass: number) {
  const secret = process.env.CRON_SECRET;
  const base = origin();
  if (!secret || !base || pass > MAX_PASSES) return false;
  after(async () => {
    // Only the hand-off is awaited; the next pass runs on its own invocation.
    await fetch(`${base}/api/cron/grading?pass=${pass}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
  });
  return true;
}

export const hasLeftover = (outcomes: { note: string }[]) => outcomes.some((outcome) => /out of time/i.test(outcome.note));

// Hands one stage of the refresh to the next route on its own invocation (authenticated with the cron secret).
export function handOff(path: "/api/cron/refresh" | "/api/cron/grading?pass=1" | "/api/cron/lms-sync?chain=1") {
  const secret = process.env.CRON_SECRET;
  const base = origin();
  if (!secret || !base) return false;
  after(async () => {
    await fetch(`${base}${path}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
  });
  return true;
}
