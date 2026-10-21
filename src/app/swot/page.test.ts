import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { from, records } = vi.hoisted(() => ({ from: vi.fn(), records: {} as Record<string, unknown[]> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => createElement("main", null, children) }));
vi.mock("@/components/swot-form", () => ({ SwotForm: () => createElement("div", null, "Add an observation form") }));

import SwotPage from "./page";

function queryFor(table: string) {
  const result: Record<string, unknown> = {};
  const exclusions: { column: string; value: unknown }[] = [];
  for (const method of ["select", "order"]) result[method] = () => result;
  result.not = (column: string, _operator: string, value: unknown) => { exclusions.push({ column, value }); return result; };
  result.then = (resolve: (value: unknown) => unknown) => {
    const data = (records[table] ?? []).filter((record) => !exclusions.some(({ column, value }) => (record as Record<string, unknown>)[column] === value));
    return Promise.resolve({ data, error: null }).then(resolve);
  };
  return result;
}

function setup() {
  Object.assign(records, {
    swot_entries: [],
    submissions: [
      { id: "mark-1", assessment_id: "assessment-1", official_mark: 92, official_feedback: "Strong customer insight", official_mark_source: "Mesa LMS (Nexus MCP)" },
      { id: "mark-2", assessment_id: "assessment-2", official_mark: 31.5, official_feedback: "Review the calculations", official_mark_source: "Mesa LMS (Nexus MCP)" },
    ],
    assessments: [
      { id: "assessment-1", course_id: "course-1", title: "Mid-Term Assignment" },
      { id: "assessment-2", course_id: "course-2", title: "Mid-Term Assessment" },
    ],
    courses: [{ id: "course-1", title: "The Art of Selling" }, { id: "course-2", title: "Fundamentals of Finance" }],
  });
  from.mockImplementation((table: string) => queryFor(table));
}

describe("SWOT evidence signals", () => {
  afterEach(() => { vi.unstubAllEnvs(); from.mockReset(); });

  it("shows evidence-linked drafts from synced official marks when no saved SWOT entries exist", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    setup();
    const page = await SwotPage();
    const markup = renderToStaticMarkup(createElement(() => page));

    expect(markup).toContain("High result in The Art of Selling");
    expect(markup).toContain("Review the result in Fundamentals of Finance");
    expect(markup).toContain("Turn evaluator feedback into a focused practice plan");
    expect(markup).toContain("External threats remain unassessed");
    expect(markup).toContain("92/100");
    expect(markup).toContain("31.5/100");
  });

  it("uses feedback records even when the submission has no official mark", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    setup();
    records.submissions = [{ id: "feedback-only", assessment_id: "assessment-1", official_mark: null, official_feedback: "Use actual numbers for each answer", official_mark_source: "Mesa LMS (Nexus MCP)" }];
    const page = await SwotPage();
    const markup = renderToStaticMarkup(createElement(() => page));

    expect(markup).toContain("Use actual numbers for each answer");
    expect(markup).toContain("0 valid official marks and 1 feedback record");
  });
});
