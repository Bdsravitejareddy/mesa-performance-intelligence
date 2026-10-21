import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "./route";

type Call = { table: string; op: string; args: unknown[] };
const { state } = vi.hoisted(() => ({ state: { userId: "member" as string | null, assessment: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: "owner" } as Record<string, string> | null, known: [] as { id: string }[], existing: [] as { competency_id: string; mapping_source: string }[], calls: [] as Call[] } }));

function query(table: string) {
  const record = (op: string, args: unknown[]) => state.calls.push({ table, op, args });
  const chain: Record<string, unknown> = {};
  let result: unknown = { data: null, error: null };
  chain.select = (...args: unknown[]) => { record("select", args); result = table === "competencies" ? { data: state.known, error: null } : table === "assessment_competencies" ? { data: state.existing, error: null } : { data: state.assessment, error: null }; return chain; };
  chain.eq = (...args: unknown[]) => { record("eq", args); return chain; };
  chain.in = (...args: unknown[]) => { record("in", args); return chain; };
  chain.delete = (...args: unknown[]) => { record("delete", args); result = { error: null }; return chain; };
  chain.insert = (...args: unknown[]) => { record("insert", args); return Promise.resolve({ error: null }); };
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: state.userId ? { sub: state.userId } : {} } }) }, from: query }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));

const req = (body: unknown) => new NextRequest("https://app.test/api/assessment-competencies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const assessmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("assessment competency tagging", () => {
  afterEach(() => { state.userId = "member"; state.assessment = { id: assessmentId, user_id: "owner" }; state.known = []; state.existing = []; state.calls = []; });

  it("adds new tags owned by the assessment owner and removes only member tags", async () => {
    state.known = [{ id: "analytical.numerical_analysis" }, { id: "business.strategy" }];
    state.existing = [{ competency_id: "business.strategy", mapping_source: "user_tagged" }, { competency_id: "business.finance", mapping_source: "user_tagged" }, { competency_id: "decision.judgement", mapping_source: "official_rubric" }];
    const response = await PUT(req({ assessmentId, competencyIds: ["analytical.numerical_analysis", "business.strategy"] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, added: 1, removed: 1 });
    const insert = state.calls.find((call) => call.op === "insert");
    expect(insert?.args[0]).toEqual([expect.objectContaining({ user_id: "owner", competency_id: "analytical.numerical_analysis", mapping_source: "user_tagged", review_status: "accepted" })]);
    const removed = state.calls.filter((call) => call.table === "assessment_competencies" && call.op === "in").map((call) => call.args);
    expect(removed).toEqual([["competency_id", ["business.finance"]]]);
  });

  it("requires sign-in", async () => {
    state.userId = null;
    expect((await PUT(req({ assessmentId, competencyIds: [] }))).status).toBe(401);
  });

  it("rejects unknown competencies and malformed input", async () => {
    state.known = [];
    expect((await PUT(req({ assessmentId, competencyIds: ["made.up"] }))).status).toBe(400);
    expect((await PUT(req({ assessmentId: "not-a-uuid", competencyIds: [] }))).status).toBe(400);
    expect((await PUT(req({ assessmentId, competencyIds: ["DROP TABLE"] }))).status).toBe(400);
  });

  it("returns not found for assessments outside the workspace", async () => {
    state.assessment = null;
    expect((await PUT(req({ assessmentId, competencyIds: [] }))).status).toBe(404);
  });
});
