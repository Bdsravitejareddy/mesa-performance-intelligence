import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/competency/history", () => ({ recordCompetencySnapshots: vi.fn() }));
import { persistRecords } from "./sync";
import type { MesaAssignmentRecord } from "./normalize";

type Row = Record<string, unknown>;
function fakeClient(tables: Record<string, Row[]>) {
  const writes: { table: string; op: string; row: Row }[] = [];
  return {
    writes,
    from(table: string) {
      const chain: Record<string, unknown> = {};
      let pending: Row | null = null;
      chain.select = () => chain;
      chain.in = () => chain;
      chain.eq = () => chain;
      chain.is = () => chain;
      chain.upsert = (row: Row) => { writes.push({ table, op: "upsert", row }); pending = row; return chain; };
      chain.insert = (row: Row) => { writes.push({ table, op: "insert", row }); pending = row; return chain; };
      chain.single = async () => ({ data: { id: `${table}-${writes.length}`, ...pending }, error: null });
      chain.maybeSingle = chain.single;
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(pending ? { error: null } : { data: tables[table] ?? [], error: null }).then(resolve);
      return chain;
    },
  };
}

const record = (title: string, id: string, score: number | null = 80): MesaAssignmentRecord => ({ assignmentId: id, submissionId: `s-${id}`, courseId: "", courseTitle: "", title, maximumMark: 100, sourceMaximumMark: 100, sourceScore: score, score, feedback: "", status: "graded", submittedAt: null, sourceUpdatedAt: null });

describe("course-less LMS assignments", () => {
  const courses = [
    { id: "ent", user_id: "owner", title: "Entrepreneurship 101 with Abhishek", lms_course_id: "lms-ent" },
    { id: "fin", user_id: "owner", title: "Fundamentals of Finance with Prof. Narahari", lms_course_id: "lms-fin" },
  ];

  it("files an assignment whose title names one course and holds the rest instead of dropping them", async () => {
    const client = fakeClient({ courses, lms_unassigned_assignments: [] });
    const counts = await persistRecords(client as never, "owner", ["owner"], [record("Quiz 2 Entrepreneurship 101", "q2"), record("Week 1 Assignment", "w1", null)]);
    expect(counts).toMatchObject({ resolvedUnassigned: 1, skipped: 1, assessments: 1, marks: 1 });
    const holds = client.writes.filter((write) => write.table === "lms_unassigned_assignments").map((write) => write.row);
    expect(holds.map((row) => [row.title, row.resolved_course_id, row.resolution])).toEqual([["Quiz 2 Entrepreneurship 101", "ent", "auto_title"], ["Week 1 Assignment", null, null]]);
    expect(client.writes.find((write) => write.table === "assessments")?.row).toMatchObject({ course_id: "ent", source_record_id: "mesa-lms:assignment:q2" });
  });

  it("keeps a member's confirmed course over the title guess", async () => {
    const client = fakeClient({ courses, lms_unassigned_assignments: [{ source_record_id: "mesa-lms:assignment:w1", resolved_course_id: "fin", resolution: "member", resolved_by: "member-1", resolved_at: "2026-10-22T00:00:00Z" }] });
    const counts = await persistRecords(client as never, "owner", ["owner"], [record("Week 1 Assignment", "w1")]);
    expect(counts).toMatchObject({ resolvedUnassigned: 1, skipped: 0 });
    expect(client.writes.find((write) => write.table === "lms_unassigned_assignments")?.row).toMatchObject({ resolved_course_id: "fin", resolution: "member", resolved_by: "member-1" });
    expect(client.writes.find((write) => write.table === "assessments")?.row).toMatchObject({ course_id: "fin" });
  });
});
