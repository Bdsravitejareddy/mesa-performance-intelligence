import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { from, records } = vi.hoisted(() => ({ from: vi.fn(), records: {} as Record<string, unknown[]> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "member-1" } } }) }, from }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));
vi.mock("next/navigation", () => ({ usePathname: () => "/courses/course-1", useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error("not found"); } }));

import CourseDetailPage from "./page";

function queryFor(table: string) {
  const result: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order"]) result[method] = () => result;
  result.maybeSingle = async () => ({ data: table === "courses" ? records.courses?.[0] ?? null : null, error: null });
  result.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: records[table] ?? [], error: null }).then(resolve);
  return result;
}

function setup(markSource: string) {
  Object.assign(records, {
    courses: [{ id: "course-1", code: "HT1", title: "Health Strategy", term: "2026" }],
    course_materials: [],
    assessments: [{ id: "assessment-1", title: "Mid-term", assessment_format: "Written", official_max_mark: 100 }],
    drive_sources: [], rubrics: [], rubric_criteria: [],
    submissions: [{ id: "submission-1", assessment_id: "assessment-1", official_mark: 82, official_feedback: "Clear argument", official_mark_source: markSource, created_at: "2026-10-01" }],
    submission_documents: [], evaluation_reports: [], evaluation_evidence: [], role_profiles: [],
  });
  from.mockImplementation((table: string) => queryFor(table));
}

describe("course assessment submission origin notice", () => {
  afterEach(() => { vi.unstubAllEnvs(); from.mockReset(); });

  it("opens the submission fallback visibly for an LMS-origin record even when no evaluation report exists", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    setup("Mesa LMS (Nexus MCP)");
    const page = await CourseDetailPage({ params: Promise.resolve({ id: "course-1" }) });
    const markup = renderToStaticMarkup(createElement(() => page));
    expect(markup).toMatch(/id="submission-files-submission-1"[^>]*open/);
    expect(markup).toContain("The LMS connector does not expose the submitted file content.");
    expect(markup).toContain("Link indexed course material");
    expect(markup).not.toContain("Evidence-linked assessment summary");
  });

  it("keeps manual-origin submission controls collapsed without claiming LMS attachment failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    setup("user_entered");
    const page = await CourseDetailPage({ params: Promise.resolve({ id: "course-1" }) });
    const markup = renderToStaticMarkup(createElement(() => page));
    expect(markup).toContain('id="submission-files-submission-1"');
    expect(markup).not.toMatch(/id="submission-files-submission-1"[^>]*open/);
    expect(markup).not.toContain("LMS connector does not expose");
  });
});
