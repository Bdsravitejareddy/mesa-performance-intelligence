import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PATCH, POST } from "./route";

const { state } = vi.hoisted(() => ({ state: { userId: "member" as string | null, inserted: null as unknown, updated: null as unknown, updatedRows: [{ id: "c" }] as { id: string }[] } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: state.userId ? { sub: state.userId } : {} } }) },
  from: () => ({
    insert: (row: unknown) => { state.inserted = row; return { select: () => ({ single: async () => ({ data: { id: "new" }, error: null }) }) }; },
    update: (row: unknown) => { state.updated = row; const chain = { eq: () => chain, select: async () => ({ data: state.updatedRows, error: null }) }; return chain; },
  }),
}) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));

const req = (method: string, body: unknown) => new NextRequest("https://app.test/api/competency-challenges", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("competency challenges", () => {
  afterEach(() => { state.userId = "member"; state.inserted = null; state.updated = null; state.updatedRows = [{ id: "c" }]; });

  it("records the disputed state, statement and counterevidence", async () => {
    const response = await POST(req("POST", { competencyId: "analytical.numerical_analysis", disputedState: "development_area", statement: "  The low marks came from formatting, not analysis. ", counterevidence: "Case study 2 scored 18/20 on analysis." }));
    expect(response.status).toBe(201);
    expect(state.inserted).toEqual({ user_id: "member", competency_id: "analytical.numerical_analysis", disputed_state: "development_area", statement: "The low marks came from formatting, not analysis.", counterevidence: "Case study 2 scored 18/20 on analysis." });
  });

  it("rejects empty statements, unknown states and anonymous requests", async () => {
    expect((await POST(req("POST", { competencyId: "analytical.numerical_analysis", disputedState: "development_area", statement: "  " }))).status).toBe(400);
    expect((await POST(req("POST", { competencyId: "analytical.numerical_analysis", disputedState: "genius", statement: "x" }))).status).toBe(400);
    state.userId = null;
    expect((await POST(req("POST", { competencyId: "analytical.numerical_analysis", disputedState: "emerging", statement: "x" }))).status).toBe(401);
  });

  it("requires a note to resolve, allows withdrawal, and reports closed challenges", async () => {
    expect((await PATCH(req("PATCH", { id: ID, status: "resolved", resolutionNote: "" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { id: ID, status: "withdrawn" }))).status).toBe(200);
    expect(state.updated).toEqual(expect.objectContaining({ status: "withdrawn" }));
    state.updatedRows = [];
    expect((await PATCH(req("PATCH", { id: ID, status: "resolved", resolutionNote: "Re-tagged criterion." }))).status).toBe(404);
  });
});
