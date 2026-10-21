import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "./route";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  hasSupabaseConfig: vi.fn(() => true),
  createClient: vi.fn(),
  claims: vi.fn(async () => ({ data: { claims: { sub: "workspace-member" } } })),
  rows: new Map<string, unknown[]>(),
  writes: [] as Array<{ table: string; values: unknown; filters: Record<string, unknown> }>,
  insertError: null as unknown,
}));

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: mocks.hasSupabaseConfig }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

function query(table: string, filters: Record<string, unknown> = {}) {
  const result = () => mocks.rows.get(table) ?? [];
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
    in: (key: string, value: unknown) => { filters[key] = value; return builder; },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: result().find((row) => Object.entries(filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value)) ?? null, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: result().filter((row) => Object.entries(filters).every(([key, value]) => Array.isArray(value) ? value.includes((row as Record<string, unknown>)[key]) : (row as Record<string, unknown>)[key] === value)), error: null })),
    insert: (values: unknown) => { mocks.writes.push({ table, values, filters: { ...filters } }); return { select: () => ({ single: async () => ({ data: { id: "finding-new" }, error: mocks.insertError }) }) }; },
    upsert: (values: unknown) => { mocks.writes.push({ table, values, filters: { ...filters } }); return { select: () => ({ single: async () => ({ data: { id: "finding-new" }, error: mocks.insertError }) }) }; },
    update: (values: unknown) => {
      const updateBuilder = {
        eq: (key: string, value: unknown) => { filters[key] = value; return updateBuilder; },
        select: () => ({ single: async () => { mocks.writes.push({ table, values, filters: { ...filters } }); return { data: { id: "saved-finding", ...values as object }, error: null }; } }),
      };
      return updateBuilder;
    },
  };
  return builder;
}

const req = (url: string, body?: unknown) => new NextRequest(`https://app.test${url}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
const role = { id: "role-1", user_id: "workspace-member", competencies: [{ id: "clinical-discovery", title: "Clinical product discovery", description: "Lead discovery", sourceQuote: "Lead clinical product discovery", evidenceKind: "required" }] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = new Map([
    ["role_profiles", [role]],
    ["evaluation_evidence", [{ id: "evidence-1", user_id: "workspace-member", evaluation_id: "report-1", material_reference_id: "reference-1", criterion: "Clinical product discovery", finding: "Applied clinician interviews", submission_quote: "Interviewed physicians", confidence: "high", evaluation_reports: { status: "approved" }, material_references: { reference_label: "Course · Product discovery · page 3" } }]],
    ["evaluation_reports", [{ id: "report-1", user_id: "workspace-member", status: "approved" }]],
    ["material_references", [{ id: "reference-1", user_id: "workspace-member", reference_label: "Course · Product discovery · page 3" }]],
    ["topic_competencies", []],
    ["role_evidence_findings", []],
  ]);
  mocks.writes = [];
  mocks.insertError = null;
  mocks.createClient.mockResolvedValue({ auth: { getClaims: mocks.claims }, from: (table: string) => query(table) });
});

describe("career evidence persistence", () => {
  it("rejects anonymous reads and writes", async () => {
    mocks.claims.mockImplementationOnce(async () => ({ data: { claims: {} } } as never));
    expect((await GET(req("/api/career/evidence?roleProfileId=role-1"))).status).toBe(401);
    mocks.claims.mockImplementationOnce(async () => ({ data: { claims: {} } } as never));
    expect((await POST(req("/api/career/evidence", { roleProfileId: "role-1", evidenceIds: ["evidence-1"] }))).status).toBe(401);
    mocks.claims.mockImplementationOnce(async () => ({ data: { claims: {} } } as never));
    expect((await PATCH(req("/api/career/evidence", { id: "finding-1", reviewStatus: "accepted" }))).status).toBe(401);
  });

  it("stores only evidence citations belonging to the authenticated workspace member", async () => {
    const response = await POST(req("/api/career/evidence", { roleProfileId: "role-1", evidenceIds: ["evidence-1"] }));
    expect(response.status).toBe(201);
    const insert = mocks.writes.find((write) => write.table === "role_evidence_findings");
    expect(insert?.values).toMatchObject({ user_id: "workspace-member", role_profile_id: "role-1", requirement_id: "clinical-discovery", review_status: "suggested", state: "adjacent", suggested_state: "demonstrated" });
    expect((insert?.values as { evidence_refs: unknown[] }).evidence_refs).toEqual([expect.objectContaining({ id: "evidence-1", sourceReference: "Course · Product discovery · page 3" })]);
  });

  it("rejects unknown or cross-workspace evidence citations", async () => {
    expect((await POST(req("/api/career/evidence", { roleProfileId: "role-1", evidenceIds: ["foreign-evidence"] }))).status).toBe(400);
    expect(mocks.writes.filter((write) => write.table === "role_evidence_findings")).toEqual([]);
  });

  it("rejects a role profile outside the authenticated workspace", async () => {
    mocks.rows.set("role_profiles", []);
    expect((await POST(req("/api/career/evidence", { roleProfileId: "other-role", evidenceIds: ["evidence-1"] }))).status).toBe(404);
  });

  it("requires explicit acceptance and only then writes demonstrated state", async () => {
    mocks.rows.set("role_evidence_findings", [{ id: "finding-1", user_id: "workspace-member", role_profile_id: "role-1", state: "adjacent", suggested_state: "demonstrated", review_status: "suggested" }]);
    const response = await PATCH(req("/api/career/evidence", { id: "finding-1", reviewStatus: "accepted" }));
    expect(response.status).toBe(200);
    expect(mocks.writes.at(-1)).toMatchObject({ table: "role_evidence_findings", values: { state: "demonstrated", review_status: "accepted" }, filters: { id: "finding-1", user_id: "workspace-member" } });
  });

  it("persists dismissals without converting a finding to demonstrated", async () => {
    mocks.rows.set("role_evidence_findings", [{ id: "finding-1", user_id: "workspace-member", role_profile_id: "role-1", state: "adjacent", suggested_state: "demonstrated", review_status: "suggested" }]);
    expect((await PATCH(req("/api/career/evidence", { id: "finding-1", reviewStatus: "dismissed" }))).status).toBe(200);
    expect(mocks.writes.at(-1)).toMatchObject({ values: { state: "adjacent", review_status: "dismissed" } });
  });

  it("does not overwrite an explicit review decision when refreshing suggestions", async () => {
    mocks.rows.set("role_evidence_findings", [{ id: "finding-accepted", user_id: "workspace-member", role_profile_id: "role-1", requirement_id: "clinical-discovery", review_status: "accepted", state: "demonstrated", suggested_state: "demonstrated" }]);
    const response = await POST(req("/api/career/evidence", { roleProfileId: "role-1", evidenceIds: ["evidence-1"] }));
    expect(response.status).toBe(201);
    expect(mocks.writes.filter((write) => write.table === "role_evidence_findings")).toEqual([]);
  });

  it("rejects attempts to edit records outside the current member scope", async () => {
    mocks.rows.set("role_evidence_findings", []);
    expect((await PATCH(req("/api/career/evidence", { id: "foreign-finding", reviewStatus: "accepted" }))).status).toBe(404);
    expect(mocks.writes.filter((write) => write.table === "role_evidence_findings")).toHaveLength(0);
  });
});
