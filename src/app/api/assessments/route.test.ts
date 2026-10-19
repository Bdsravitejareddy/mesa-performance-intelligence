import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const { insert, from } = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "second-member" } } }) }, from }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));

describe("assessment ownership in the shared workspace", () => {
  afterEach(() => vi.clearAllMocks());
  it("keeps the course owner on new child rows when another member contributes", async () => {
    const course = { select: () => course, eq: () => course, maybeSingle: async () => ({ data: { id: "course", user_id: "first-member" } }) };
    insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "assessment" }, error: null }) }) });
    from.mockImplementation((table) => table === "courses" ? course : { insert });
    const response = await POST(new NextRequest("https://example.com/api/assessments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: "course", title: "Shared assessment" }) }));
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "first-member", course_id: "course" }));
  });
});
