import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "./route";

const { state } = vi.hoisted(() => ({ state: { userId: "member" as string | null, material: { id: "m", user_id: "owner" } as unknown, page: { id: "p" } as unknown, upserted: null as unknown, deleted: false } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: state.userId ? { sub: state.userId } : {} } }) },
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: table === "course_materials" ? state.material : state.page, error: null });
    chain.upsert = async (row: unknown) => { state.upserted = row; return { error: null }; };
    chain.delete = () => { state.deleted = true; const inner = { eq: () => inner, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }; return inner; };
    return chain;
  },
}) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const call = (body: unknown) => PUT(new NextRequest(`https://app.test/api/materials/${ID}/notes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: ID }) });

describe("material page notes", () => {
  afterEach(() => { state.userId = "member"; state.material = { id: "m", user_id: "owner" }; state.page = { id: "p" }; state.upserted = null; state.deleted = false; });

  it("saves a note owned by the material owner", async () => {
    expect((await call({ pageNumber: 4, note: "  Funnel diagram: awareness to purchase.  " })).status).toBe(200);
    expect(state.upserted).toEqual(expect.objectContaining({ user_id: "owner", material_id: ID, page_number: 4, note: "Funnel diagram: awareness to purchase.", updated_by: "member" }));
  });

  it("clears the note when it is emptied", async () => {
    const response = await call({ pageNumber: 4, note: "   " });
    expect(await response.json()).toEqual({ ok: true, cleared: true });
    expect(state.deleted).toBe(true);
  });

  it("rejects pages that do not exist, bad input and anonymous requests", async () => {
    state.page = null;
    expect((await call({ pageNumber: 99, note: "x" })).status).toBe(404);
    expect((await call({ pageNumber: 0, note: "x" })).status).toBe(400);
    state.userId = null;
    expect((await call({ pageNumber: 1, note: "x" })).status).toBe(401);
  });
});
