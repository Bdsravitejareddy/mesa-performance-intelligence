import { describe, expect, it } from "vitest";
import { createTestDatabase, owner } from "../drive-sync/importer-test-db";

describe("report card rows", () => {
  it("lets a member add the PDF breakdown but never change the official GPA or course grades", async () => {
    const db = await createTestDatabase();
    try {
      await db.exec("reset role");
      await db.query("insert into public.lms_report_cards(user_id,term,gpa,courses) values($1,'Term 1',3.4,'[{\"course\":\"Finance\",\"grade\":\"A\"}]')", [owner]);
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
      await db.query("update public.lms_report_cards set breakdown='[{\"course\":\"Finance\",\"components\":[]}]', breakdown_imported_at=now() where term='Term 1'");
      await expect(db.query("update public.lms_report_cards set gpa=4 where term='Term 1'")).rejects.toThrow(/permission denied/);
      await expect(db.query("update public.lms_report_cards set courses='[]' where term='Term 1'")).rejects.toThrow(/permission denied/);
      const saved = await db.query<{ gpa: string; breakdown: unknown[] }>("select gpa, breakdown from public.lms_report_cards where term='Term 1'");
      expect(saved.rows[0].gpa).toBe("3.400");
      expect(saved.rows[0].breakdown).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});
