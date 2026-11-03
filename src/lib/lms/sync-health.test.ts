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

describe("sync health separates failures from data completeness", () => {
  const now = new Date("2026-11-03T10:00:00Z");
  const at = (message: string, status = "partial") => ({ status, started_at: "2026-11-03T03:17:00Z", finished_at: "2026-11-03T03:18:00Z", message });
  it("treats a run whose reads all succeeded as healthy, with the mapping work as a notice", () => {
    const health = describeSyncHealth([at("Imported 49 assessment(s), 6 marks, and 3 feedback records. 7 record(s) without a course are held for review; 0 read operation(s) failed.")], now);
    expect(health.level).toBe("ok");
    expect(health.notices).toEqual(["Sync successful · 7 assignments need a course mapping before they count."]);
  });
  it("still warns when a read failed", () => {
    expect(describeSyncHealth([at("Imported 49 assessment(s). 7 record(s) without a course are held for review; 2 read operation(s) failed.")], now).level).toBe("warning");
  });
  it("reads the new success message", () => {
    const health = describeSyncHealth([at("Synced 49 assessments, 6 marks, and 3 feedback records. 1 assignment(s) need course mapping. Scores are converted to the 0–100 scale.", "succeeded")], now);
    expect(health.level).toBe("ok");
    expect(health.notices).toEqual(["Sync successful · 1 assignment needs a course mapping before it counts."]);
  });
});
