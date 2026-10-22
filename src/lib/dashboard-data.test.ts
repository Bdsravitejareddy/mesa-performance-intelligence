import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboardSnapshot } from "./dashboard-data";
import { createClient } from "./supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("dashboard setup state", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("reports missing configuration instead of showing an empty private workspace", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(getDashboardSnapshot()).rejects.toThrow("Supabase is not configured");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("keeps explicitly enabled sample data separate from the private workspace", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const snapshot = await getDashboardSnapshot();
    expect(snapshot.demoMode).toBe(true);
    expect(snapshot.courses.length).toBeGreaterThan(0);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("dashboard snapshot from private records", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function fakeClient(tables: Record<string, unknown[]>) {
    return {
      from(table: string) {
        const result = Promise.resolve({ data: tables[table] ?? [], error: null });
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "not", "order", "eq", "limit"]) chain[method] = () => chain;
        chain.then = result.then.bind(result);
        return chain;
      },
    };
  }

  it("averages every official mark, keeps unscored topics null, and reports stale sync", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test");
    const marks = [50, 60, 70, 80, 90, 100, 40, 30];
    vi.mocked(createClient).mockResolvedValue(fakeClient({
      courses: [{ id: "c1", code: "MKT", title: "Marketing", term: null }],
      assessments: [{ id: "a1", course_id: "c1", title: "Quiz", assessment_format: "Quiz", due_at: null }],
      submissions: marks.map((mark, index) => ({ id: `s${index}`, assessment_id: "a1", official_mark: mark, submitted_at: null })),
      topic_competencies: [{ topic: "Market sizing", state: "insufficient_evidence", score: null }],
      sync_runs: [{ status: "succeeded", started_at: "2026-10-01T00:00:00Z", finished_at: "2026-10-01T00:01:00Z", message: "" }],
    }) as never);

    const snapshot = await getDashboardSnapshot();
    expect(snapshot.marks).toHaveLength(6);
    expect(snapshot.markCount).toBe(8);
    // All marks out of 100 here, so weighted and unweighted agree.
    expect(snapshot.averageMark).toBe(65);
    expect(snapshot.unweightedAverage).toBe(65);
    expect(snapshot.mastery[0].value).toBeNull();
    expect(snapshot.syncHealth?.level).toBe("warning");
  });

  it("does not invent an average when no marks exist", async () => {
    const { averageOf } = await import("./dashboard-data");
    expect(averageOf([])).toBeNull();
  });
});

describe("weighted average", () => {
  it("weights each mark by its maximum marks", async () => {
    const { weightedAverage } = await import("./dashboard-data");
    // 90/100 on a 20-mark paper and 78.75/100 on a 40-mark paper.
    expect(weightedAverage([{ mark: 90, weight: 20 }, { mark: 78.75, weight: 40 }])).toBe(82.5);
    expect(weightedAverage([])).toBeNull();
  });
});
