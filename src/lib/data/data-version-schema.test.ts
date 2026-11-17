import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../drive-sync/importer-test-db";

// Cached pages are refreshed only when the workspace data version moves, so a table whose writes do not move it
// leaves pages showing old figures. Every public table must carry the trigger.
describe("workspace data version", () => {
  it("is bumped by writes to every public table", async () => {
    const db = await createTestDatabase();
    try {
      await db.exec("reset role");
      const missing = await db.query<{ name: string }>(`
        select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'workspace_data_version'
          and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'bump_workspace_data_version')`);
      expect(missing.rows.map((row) => row.name)).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
