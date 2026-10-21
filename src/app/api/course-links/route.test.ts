import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, POST } from "./route";

const { state } = vi.hoisted(() => ({ state: { userId: "member" as string | null, courses: [] as { id: string; user_id: string }[], insertError: null as { code: string } | null, inserted: null as unknown, deleted: [] as { id: string }[] } }));

function query(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.in = () => Promise.resolve({ data: state.courses, error: null });
  chain.insert = (row: unknown) => { state.inserted = row; return Promise.resolve({ error: state.insertError }); };
  chain.delete = () => ({ eq: () => ({ select: () => Promise.resolve({ data: state.deleted, error: null }) }) });
  return table ? chain : chain;
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: state.userId ? { sub: state.userId } : {} } }) }, from: query }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));

const LMS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRIVE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const req = (method: string, body: unknown) => new NextRequest("https://app.test/api/course-links", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("course links route", () => {
  afterEach(() => { state.userId = "member"; state.courses = []; state.insertError = null; state.inserted = null; state.deleted = []; });

  it("links courses using each course's own owner", async () => {
    state.courses = [{ id: LMS, user_id: "owner-a" }, { id: DRIVE, user_id: "owner-b" }];
    const response = await POST(req("POST", { assessmentCourseId: LMS, materialCourseId: DRIVE }));
    expect(response.status).toBe(201);
    expect(state.inserted).toEqual({ user_id: "owner-a", assessment_course_id: LMS, material_course_id: DRIVE, material_course_user_id: "owner-b" });
  });

  it("rejects same-course, malformed, unknown and duplicate links", async () => {
    expect((await POST(req("POST", { assessmentCourseId: LMS, materialCourseId: LMS }))).status).toBe(400);
    expect((await POST(req("POST", { assessmentCourseId: "x", materialCourseId: DRIVE }))).status).toBe(400);
    state.courses = [{ id: LMS, user_id: "a" }];
    expect((await POST(req("POST", { assessmentCourseId: LMS, materialCourseId: DRIVE }))).status).toBe(404);
    state.courses = [{ id: LMS, user_id: "a" }, { id: DRIVE, user_id: "a" }];
    state.insertError = { code: "23505" };
    expect((await POST(req("POST", { assessmentCourseId: LMS, materialCourseId: DRIVE }))).status).toBe(409);
  });

  it("requires sign-in", async () => {
    state.userId = null;
    expect((await POST(req("POST", { assessmentCourseId: LMS, materialCourseId: DRIVE }))).status).toBe(401);
    expect((await DELETE(req("DELETE", { materialCourseId: DRIVE }))).status).toBe(401);
  });

  it("unlinks and reports a missing link", async () => {
    expect((await DELETE(req("DELETE", { materialCourseId: DRIVE }))).status).toBe(404);
    state.deleted = [{ id: "link" }];
    expect((await DELETE(req("DELETE", { materialCourseId: DRIVE }))).status).toBe(200);
  });
});
