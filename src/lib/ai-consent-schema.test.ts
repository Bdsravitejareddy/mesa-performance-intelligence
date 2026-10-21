import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

describe("AI consent and dashboard summary migrations", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth, public to authenticated; grant execute on function auth.uid() to authenticated;`);
    for (const migration of ["20261022090004_ai_processing_consents.sql", "20261022090006_dashboard_insight_summaries.sql", "20261022090009_ai_consent_configuration_fingerprint.sql"]) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await db.exec(`insert into auth.users values ('${owner}'),('${other}'); set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
  });
  afterEach(async () => { await db?.close(); });

  it("keeps consent and cached summaries isolated to the consenting account", async () => {
    await db.query("insert into public.ai_processing_consents(user_id,disclosure_version,configuration_fingerprint,provider_host,provider_model) values ($1,'v1',$2,'provider.test','model')", [owner, "c".repeat(64)]);
    await db.query("insert into public.dashboard_insight_summaries(user_id,input_hash,summary) values ($1,$2,'{}'::jsonb)", [owner, "a".repeat(64)]);
    expect((await db.query("select user_id from public.ai_processing_consents")).rows).toEqual([{ user_id: owner }]);
    expect((await db.query("select user_id from public.dashboard_insight_summaries")).rows).toEqual([{ user_id: owner }]);
    await expect(db.query("insert into public.ai_processing_consents(user_id,disclosure_version,configuration_fingerprint,provider_host,provider_model) values ($1,'v1',$2,'provider.test','model')", [other, "d".repeat(64)])).rejects.toThrow(/row-level security/i);
    await expect(db.query("insert into public.dashboard_insight_summaries(user_id,input_hash,summary) values ($1,$2,'{}'::jsonb)", [other, "b".repeat(64)])).rejects.toThrow(/row-level security/i);
    await db.exec("reset role; set role anon");
    await expect(db.query("select user_id from public.ai_processing_consents")).rejects.toThrow(/permission denied/i);
  });
});
