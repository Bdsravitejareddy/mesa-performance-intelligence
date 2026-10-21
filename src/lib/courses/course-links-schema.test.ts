import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migration = (name: string) => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OUT = "33333333-3333-4333-8333-333333333333";
const LMS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRIVE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OUTSIDER_COURSE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("course links migration", () => {
  let db: PGlite;
  afterEach(async () => { await db?.close(); });

  it("links courses within the workspace, rejects chains and outsiders, and lets submission evidence cite linked material", async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to authenticated;
      grant execute on function auth.uid() to authenticated;
      create schema storage;
      create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(object_name text) returns text[] language sql immutable as $$ select regexp_split_to_array(object_name,'/') $$;
      grant usage on schema storage to authenticated;
    `);
    for (const name of ["20261019062743_create_course_intelligence_schema.sql", "20261019063732_shared_workspace_access.sql", "20261022090000_submission_documents.sql", "20261022090008_submission_document_integrity.sql", "20261022130000_course_links.sql"]) await db.exec(await migration(name));
    await db.exec(`
      insert into private.workspace_access(email) values ('a@example.com'),('b@example.com');
      insert into auth.users(id,email,email_confirmed_at) values ('${A}','a@example.com',now()),('${B}','b@example.com',now()),('${OUT}','out@example.com',now());
      insert into public.courses(id,user_id,title) values ('${LMS}','${A}','Fundamentals of Finance'),('${DRIVE}','${A}','mesasem1finance'),('${OTHER}','${B}','mesasem1other'),('${OUTSIDER_COURSE}','${OUT}','Outsider');
      insert into public.assessments(id,user_id,course_id,title) values ('a0000000-0000-4000-8000-000000000001','${A}','${LMS}','Mid-term');
      insert into public.submissions(id,user_id,assessment_id) values ('50000000-0000-4000-8000-000000000001','${A}','a0000000-0000-4000-8000-000000000001');
      insert into public.course_materials(id,user_id,course_id,name,storage_path,mime_type,file_size,extraction_status) values ('m0000000-0000-4000-8000-000000000001','${A}','${DRIVE}','Lecture.pdf','${A}/x/lecture.pdf','application/pdf',10,'complete');
      set role authenticated;
      select set_config('request.jwt.claim.sub','${B}',false);
    `.replaceAll("m0000000", "e0000000"));

    const evidence = (material: string) => `insert into public.submission_documents(user_id,submission_id,source_kind,source_id,course_material_id,name,mime_type,file_size,source_version)
      values ('${A}','50000000-0000-4000-8000-000000000001','drive','src','${material}','Lecture.pdf','application/pdf',10,'1')`;
    // Before linking, Drive material from another course is rejected.
    await expect(db.exec(evidence("e0000000-0000-4000-8000-000000000001"))).rejects.toThrow(/must match/);

    // The second member links courses owned by the first; owners come from the course rows.
    await db.exec(`insert into public.course_links(user_id,assessment_course_id,material_course_id,material_course_user_id) values ('${A}','${LMS}','${DRIVE}','${A}')`);
    expect((await db.query<{ linked_by: string }>("select linked_by from public.course_links")).rows[0].linked_by).toBe(B);
    await db.exec(evidence("e0000000-0000-4000-8000-000000000001"));

    // A Drive course links to one assessment course only, links cannot chain, and owner mismatches fail.
    await expect(db.exec(`insert into public.course_links(user_id,assessment_course_id,material_course_id,material_course_user_id) values ('${B}','${OTHER}','${DRIVE}','${A}')`)).rejects.toThrow();
    await expect(db.exec(`insert into public.course_links(user_id,assessment_course_id,material_course_id,material_course_user_id) values ('${A}','${DRIVE}','${OTHER}','${B}')`)).rejects.toThrow(/chained/);
    await expect(db.exec(`insert into public.course_links(user_id,assessment_course_id,material_course_id,material_course_user_id) values ('${B}','${LMS}','${OTHER}','${B}')`)).rejects.toThrow();
    await expect(db.exec(`insert into public.course_links(user_id,assessment_course_id,material_course_id,material_course_user_id) values ('${A}','${LMS}','${OUTSIDER_COURSE}','${OUT}')`)).rejects.toThrow();

    // Unlinking is allowed; outsiders see nothing.
    await db.exec("select set_config('request.jwt.claim.sub','" + OUT + "',false)");
    expect((await db.query("select id from public.course_links")).rows).toHaveLength(0);
    await db.exec("select set_config('request.jwt.claim.sub','" + A + "',false)");
    expect((await db.query("delete from public.course_links returning id")).rows).toHaveLength(1);
  });
});
