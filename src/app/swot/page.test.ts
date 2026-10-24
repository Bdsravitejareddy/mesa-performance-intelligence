import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { records, inserts } = vi.hoisted(() => ({ records: {} as Record<string, unknown[]>, inserts: [] as { table: string; row: unknown }[] }));
function chain(table: string) {
  const result: Record<string, unknown> = {};
  for (const method of ["select", "order", "eq", "neq", "is", "not", "limit", "in"]) result[method] = () => result;
  result.maybeSingle = async () => ({ data: (records[table] ?? [])[0] ?? null, error: null });
  result.insert = async (row: unknown) => { inserts.push({ table, row }); return { error: null }; };
  result.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: records[table] ?? [], error: null }).then(resolve);
  return result;
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "member" } } }) }, from: chain }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children, demoMode }: { children: React.ReactNode; demoMode: boolean }) => createElement("main", { "data-demo": String(demoMode) }, children) }));
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("@/lib/data/cached", () => ({ cachedRead: async (_key: string, load: (client: unknown) => unknown) => load((await (await import("@/lib/supabase/server")).createClient())) }));
vi.mock("@/components/swot-form", () => ({ SwotForm: () => createElement("div", null, "Add an observation form") }));

import SwotPage from "./page";

describe("SWOT story page", () => {
  it("leads with what stands out, shows strengths from official results, keeps unassessed skills out of weaknesses, and records a snapshot", async () => {
    Object.assign(records, {
      competencies: [{ id: "communication.clarity", domain_key: "communication", domain_name: "Communication", name: "Clarity", description: "", sort_order: 1 }, { id: "technical.sql", domain_key: "technical", domain_name: "Technical", name: "SQL", description: "", sort_order: 2 }],
      assessment_competencies: [{ assessment_id: "a1", competency_id: "communication.clarity", mapping_source: "ai_suggested", review_status: "accepted" }, { assessment_id: "a2", competency_id: "communication.clarity", mapping_source: "ai_suggested", review_status: "accepted" }],
      assessments: [{ id: "a1", course_id: "c1", title: "Pitch" }, { id: "a2", course_id: "c1", title: "Essay" }],
      submissions: [{ id: "s1", assessment_id: "a1", official_mark: 92, official_feedback: "", official_mark_source: "LMS", submitted_at: null }, { id: "s2", assessment_id: "a2", official_mark: 90, official_feedback: "", official_mark_source: "LMS", submitted_at: null }],
      courses: [{ id: "c1", title: "Power of Communication" }],
      professional_claims: [], professional_evidence: [], sync_runs: [], lms_unassigned_assignments: [], swot_entries: [], swot_snapshots: [], swot_narratives: [],
    });
    const html = renderToStaticMarkup(await SwotPage());
    expect(html).toContain('data-demo="false"');
    expect(html).toContain("What stands out");
    expect(html).toContain("Clarity is one of your clearest strengths.");
    expect(html).toContain("What you can build on");
    expect(html).toContain("See evidence");
    expect(html).toContain("Official result");
    expect(html).toContain("Start here");
    expect(html).not.toMatch(/Possibility|Low confidence|medium impact|Turn emerging|supported resume claims/i);
    const weaknesses = html.slice(html.indexOf("What needs attention"), html.indexOf("Where to focus next"));
    expect(weaknesses).not.toContain("SQL");
    expect(weaknesses).toContain("never counted as weaknesses");
    expect(inserts.some((item) => item.table === "swot_snapshots")).toBe(true);
  });
});
