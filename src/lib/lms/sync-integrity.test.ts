import { describe, expect, it } from "vitest";
import { createTestDatabase, owner } from "../drive-sync/importer-test-db";

describe("Mesa LMS sync database safeguards", () => {
  it("returns only currently invited and verified members to the service role", async () => {
    const db = await createTestDatabase();
    try {
      const members = await db.query<{ id: string }>("select * from public.mesa_lms_sync_member_ids() as t(id)");
      expect(members.rows.map((row) => row.id)).toEqual([owner, "22222222-2222-4222-8222-222222222222"]);
      await db.exec("reset role");
      await db.query("delete from private.workspace_access where email='second@example.com'");
      await db.exec("set role service_role");
      const updated = await db.query<{ id: string }>("select * from public.mesa_lms_sync_member_ids() as t(id)");
      expect(updated.rows.map((row) => row.id)).toEqual([owner]);
    } finally {
      await db.close();
    }
  });

  it("preserves existing marks when sparse or older LMS snapshots are upserted", async () => {
    const db = await createTestDatabase();
    try {
      await db.exec("reset role");
      const assessment = (await db.query<{ id: string }>(
        "insert into public.assessments(user_id,course_id,title,source_record_id) values($1,$2,'Case','mesa-lms:assignment:a1') returning id",
        [owner, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      )).rows[0].id;
      const inserted = (await db.query<{ id: string }>(
        "insert into public.submissions(user_id,assessment_id,answer_text,official_mark,official_feedback,official_mark_source,source_record_id,lms_submission_status,source_updated_at) values($1,$2,'Student answer',92,'Strong work','Mesa LMS','mesa-lms:submission:s1','Released','2026-01-02T00:00:00Z') returning id",
        [owner, assessment],
      )).rows[0].id;
      await db.query(
        "insert into public.submissions(user_id,assessment_id,source_record_id) values($1,$2,'mesa-lms:submission:s1') on conflict(user_id,source_record_id) do update set official_mark=excluded.official_mark,official_feedback=excluded.official_feedback,answer_text=excluded.answer_text,source_updated_at=excluded.source_updated_at",
        [owner, assessment],
      );
      await db.query("update public.submissions set official_mark=98,official_feedback='Updated grade',source_updated_at=null where id=$1", [inserted]);
      await db.query(
        "insert into public.submissions(user_id,assessment_id,source_record_id) values($1,$2,'mesa-lms:submission:s1') on conflict(user_id,source_record_id) do update set official_mark=excluded.official_mark,official_feedback=excluded.official_feedback,answer_text=excluded.answer_text,source_updated_at=excluded.source_updated_at",
        [owner, assessment],
      );
      await db.query(
        "insert into public.submissions(user_id,assessment_id,official_mark,official_feedback,source_record_id,lms_submission_status,source_updated_at) values($1,$2,70,'Older score','mesa-lms:submission:s1','Graded','2026-01-01T00:00:00Z') on conflict(user_id,source_record_id) do update set official_mark=excluded.official_mark,official_feedback=excluded.official_feedback,lms_submission_status=excluded.lms_submission_status,source_updated_at=excluded.source_updated_at",
        [owner, assessment],
      );
      const saved = await db.query<{ answer_text: string; official_mark: string; official_feedback: string; lms_submission_status: string }>(
        "select answer_text,official_mark,official_feedback,lms_submission_status from public.submissions where id=$1", [inserted],
      );
      expect(saved.rows[0]).toEqual({ answer_text: "Student answer", official_mark: "98.00", official_feedback: "Updated grade", lms_submission_status: "Released" });
    } finally {
      await db.close();
    }
  });
});
