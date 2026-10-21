import { describe, expect, it } from "vitest";
import { describeSyncHealth, type SyncRun } from "./sync-health";

const now = new Date("2026-10-22T12:00:00Z");
const run = (status: string, finishedHoursAgo: number | null, startedHoursAgo = finishedHoursAgo ?? 0): SyncRun => ({
  status,
  started_at: new Date(now.getTime() - startedHoursAgo * 3600000).toISOString(),
  finished_at: finishedHoursAgo === null ? null : new Date(now.getTime() - finishedHoursAgo * 3600000).toISOString(),
  message: "",
});

describe("LMS sync health", () => {
  it("reports a never-run sync instead of implying the data is current", () => {
    const health = describeSyncHealth([], now);
    expect(health.level).toBe("never");
    expect(health.lastCompletedAt).toBeNull();
  });

  it("is healthy after a recent successful sync", () => {
    const health = describeSyncHealth([run("succeeded", 3)], now);
    expect(health.level).toBe("ok");
    expect(health.warnings).toEqual([]);
  });

  it("warns when no sync has completed within the daily window", () => {
    const health = describeSyncHealth([run("succeeded", 40)], now);
    expect(health.level).toBe("warning");
    expect(health.warnings.join(" ")).toMatch(/40 hours/);
  });

  it("keeps the last completed time when the latest run failed", () => {
    const health = describeSyncHealth([run("failed", 1), run("succeeded", 5)], now);
    expect(health.level).toBe("error");
    expect(health.lastCompletedAt).toBe(run("succeeded", 5).finished_at);
  });

  it("surfaces partial syncs as needing review", () => {
    expect(describeSyncHealth([run("partial", 2)], now).level).toBe("warning");
  });

  it("flags a run that never finished", () => {
    const health = describeSyncHealth([run("running", null, 1), run("succeeded", 3)], now);
    expect(health.level).toBe("warning");
    expect(health.warnings[0]).toMatch(/has not finished/);
  });

  it("treats failures-only history as an error with no completion time", () => {
    const health = describeSyncHealth([run("failed", 1), run("failed", 20)], now);
    expect(health.level).toBe("error");
    expect(health.lastCompletedAt).toBeNull();
  });
});
