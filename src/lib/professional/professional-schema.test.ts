import { describe, expect, it } from "vitest";
import { createTestDatabase, owner } from "../drive-sync/importer-test-db";

describe("professional evidence tables", () => {
  it("keeps claims unverified until another item supports them", async () => {
    const db = await createTestDatabase();
    try {
      await db.exec("reset role");
      const resume = (await db.query<{ id: string }>("insert into public.professional_evidence(user_id,kind,title) values($1,'resume','Resume') returning id", [owner])).rows[0].id;
      const project = (await db.query<{ id: string }>("insert into public.professional_evidence(user_id,kind,title,url) values($1,'project','Dashboard','https://example.com/d') returning id", [owner])).rows[0].id;
      const claim = (await db.query<{ id: string; status: string }>("insert into public.professional_claims(user_id,evidence_id,claim,claim_type,competency_id) values($1,$2,'Built SQL dashboards','achievement','technical.sql') returning id,status", [owner, resume])).rows[0];
      expect(claim.status).toBe("claimed");
      await expect(db.query("update public.professional_claims set status='supported' where id=$1", [claim.id])).rejects.toThrow();
      await expect(db.query("update public.professional_claims set status='supported', supporting_evidence_id=$2 where id=$1", [claim.id, resume])).rejects.toThrow();
      await db.query("update public.professional_claims set status='supported', supporting_evidence_id=$2 where id=$1", [claim.id, project]);
      await expect(db.query("insert into public.professional_evidence(user_id,kind,title,url) values($1,'project','Bad','http://insecure.example')", [owner])).rejects.toThrow();
      await expect(db.query("insert into public.professional_evidence(user_id,kind,title,storage_path) values($1,'resume','Bad','someone-else/x.pdf')", [owner])).rejects.toThrow();
      await db.query("delete from public.professional_evidence where id=$1", [resume]);
      expect((await db.query("select id from public.professional_claims")).rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  });
});
