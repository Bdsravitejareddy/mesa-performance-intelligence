export type SyncRun = { status: string; started_at: string; finished_at: string | null; message: string | null };

export type SyncHealth = {
  level: "ok" | "warning" | "error" | "never";
  latest: SyncRun | null;
  lastCompletedAt: string | null;
  warnings: string[];
  // Data that is incomplete although the sync worked, e.g. assignments waiting for a course mapping.
  notices: string[];
};

// The cron runs every 24 hours; allow two hours of slack before calling the data stale.
export const STALE_AFTER_HOURS = 26;
const STUCK_AFTER_MINUTES = 15;

// Runs must be ordered newest first. "partial" counts as completed: records were read and kept, with skips reported in its message.
export function describeSyncHealth(runs: SyncRun[], now: Date = new Date()): SyncHealth {
  const latest = runs[0] ?? null;
  if (!latest) return { level: "never", latest: null, lastCompletedAt: null, warnings: ["The LMS has never been synced. Marks shown here were entered manually, if any."], notices: [] };

  const completed = runs.find((run) => (run.status === "succeeded" || run.status === "partial") && run.finished_at);
  const lastCompletedAt = completed?.finished_at ?? null;
  const warnings: string[] = [];
  let level: SyncHealth["level"] = "ok";

  if (latest.status === "failed") {
    level = "error";
    warnings.push("The most recent LMS sync failed. Existing records were kept; nothing was overwritten.");
  } else if (latest.status === "running" && minutesSince(latest.started_at, now) > STUCK_AFTER_MINUTES) {
    level = "warning";
    warnings.push(`An LMS sync started ${Math.round(minutesSince(latest.started_at, now))} minutes ago and has not finished.`);
  } else if (latest.status === "partial" && !readsAllSucceeded(latest.message)) {
    level = "warning";
    warnings.push("The most recent LMS sync was partial. Some LMS records were unreadable; see the sync message.");
  }
  // Earlier runs were labelled partial when only course mapping was outstanding; every read succeeded in those.
  const notices: string[] = [];
  const needsMapping = Number(/(\d+) (?:assignment\(s\) need course mapping|record\(s\) without a course are held for review)/.exec(latest.message ?? "")?.[1] ?? 0);
  if (needsMapping > 0 && level !== "error") notices.push(`Sync successful · ${needsMapping} assignment${needsMapping === 1 ? "" : "s"} need${needsMapping === 1 ? "s" : ""} a course mapping before ${needsMapping === 1 ? "it counts" : "they count"}.`);

  if (!lastCompletedAt) {
    level = "error";
    warnings.push("No LMS sync has completed yet.");
  } else {
    const hours = minutesSince(lastCompletedAt, now) / 60;
    if (hours > STALE_AFTER_HOURS) {
      if (level === "ok") level = "warning";
      warnings.push(`No LMS sync has completed in ${Math.floor(hours)} hours. The daily automatic sync may not be running, so recent marks or feedback may be missing.`);
    }
  }

  return { level, latest, lastCompletedAt, warnings, notices };
}

function readsAllSucceeded(message: string | null) {
  return /\b0 read operation\(s\) failed/.test(message ?? "");
}

function minutesSince(iso: string, now: Date) {
  return (now.getTime() - new Date(iso).getTime()) / 60000;
}
