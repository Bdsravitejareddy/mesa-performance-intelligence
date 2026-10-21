import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const role = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("role evidence review persistence", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; create function storage.foldername(object_name text) returns text[] language sql immutable as $$ select parts[1:array_length(parts,1)-1] from (select string_to_array(object_name,'/') as parts) as path $$; grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;`);
    for (const name of ["20261019062743_create_course_intelligence_schema.sql", "20261019063732_shared_workspace_access.sql", "20261022090001_role_benchmark_sources.sql", "20261022090010_role_evidence_review.sql"]) {
      await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    await db.exec(`insert into private.workspace_access(email) values ('owner@example.com'),('member@example.com'); insert into auth.users values ('${owner}','owner@example.com',now()),('${member}','member@example.com',now()),('${outsider}','outsider@example.com',now()); insert into public.role_profiles(id,user_id,title) values ('${role}','${owner}','Senior TPM'); set role authenticated; select set_config('request.jwt.claim.sub','${member}',false);`);
  });
  afterEach(async () => { await db?.close(); });

  const insert = (values: Record<string, unknown>) => {
    const row = { user_id: owner, role_profile_id: role, requirement_id: "clinical-discovery", competency: "Clinical product discovery", suggested_state: "demonstrated", state: "adjacent", confidence: "high", ...values };
    const columns = Object.keys(row);
    return db.query(`insert into public.role_evidence_findings(${columns.join(",")}) values (${columns.map((_, index) => `$${index + 1}`).join(",")}) returning id`, Object.values(row));
  };

  it("lets a shared workspace member review an owner's same-workspace role finding", async () => {
    await insert({ evidence_refs: [] });
    expect((await db.query("select review_status,state,evidence_refs from public.role_evidence_findings")).rows).toEqual([{ review_status: "suggested", state: "adjacent", evidence_refs: [] }]);
    await db.exec("update public.role_evidence_findings set review_status='accepted',state='demonstrated'");
    expect((await db.query("select review_status,state from public.role_evidence_findings")).rows).toEqual([{ review_status: "accepted", state: "demonstrated" }]);
  });

  it("prevents cross-workspace role references and demonstrated state before user acceptance", async () => {
    await expect(insert({ role_profile_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })).rejects.toThrow(/foreign key/i);
    await expect(insert({ state: "demonstrated" })).rejects.toThrow(/check constraint/i);
    await expect(insert({ review_status: "accepted", state: "adjacent" })).rejects.toThrow(/check constraint/i);
  });

  it("rejects unknown evidence citations at the database boundary", async () => {
    await expect(insert({ evidence_refs: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "evaluation_finding" }] })).rejects.toThrow(/unknown or cross-workspace citation/i);
  });

  it("denies anonymous and non-member access", async () => {
    await insert({});
    await db.exec(`select set_config('request.jwt.claim.sub','${outsider}',false)`);
    expect((await db.query("select id from public.role_evidence_findings")).rows).toHaveLength(0);
    expect((await db.query("update public.role_evidence_findings set review_status='dismissed' returning id")).rows).toHaveLength(0);
    await db.exec("reset role; set role anon");
    await expect(db.query("select id from public.role_evidence_findings")).rejects.toThrow(/permission denied/i);
  });
});
