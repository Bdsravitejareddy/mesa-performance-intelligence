import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const pending = "44444444-4444-4444-8444-444444444444";
const submission = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("private submission documents migration", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to authenticated;
      grant execute on function auth.uid() to authenticated;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(object_name text) returns text[] language sql immutable as $$
        select parts[1:array_length(parts,1)-1]
        from (select string_to_array(object_name,'/') as parts) as path;
      $$;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    for (const name of ["20261019062743_create_course_intelligence_schema.sql", "20261019063732_shared_workspace_access.sql", "20261022090000_submission_documents.sql", "20261022090007_submission_document_idempotency.sql"]) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    await db.exec(`
      insert into private.workspace_access(email) values ('first@example.com'),('second@example.com'),('pending@example.com');
      insert into auth.users values ('${owner}','first@example.com',now()),('${member}','second@example.com',now()),('${outsider}','outsider@example.com',now()),('${pending}','pending@example.com',null);
      insert into public.courses(id,user_id,title) values ('${submission}','${owner}','Course');
      insert into public.assessments(id,user_id,course_id,title) values ('${submission}','${owner}','${submission}','Assessment');
      insert into public.submissions(id,user_id,assessment_id) values ('${submission}','${owner}','${submission}');
      insert into public.course_materials(id,user_id,course_id,name,storage_path,mime_type,file_size) values ('${submission}','${owner}','${submission}','slides.pdf','${owner}/slides.pdf','application/pdf',100);
      set role authenticated;
      select set_config('request.jwt.claim.sub','${member}',false);
    `);
  });
  afterEach(async () => { await db?.close(); });

  async function insertDocument(overrides: Record<string, unknown> = {}) {
    const row = { user_id: owner, submission_id: submission, source_kind: "upload", name: "answer.pdf", mime_type: "application/pdf", file_size: 20971520, storage_path: `${owner}/${submission}/document/answer.pdf`, source_version: "1", ...overrides };
    const columns = Object.keys(row);
    return db.query(`insert into public.submission_documents (${columns.join(",")}) values (${columns.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(row));
  }

  it("lets either invited member contribute under the submission parent's owner", async () => {
    await insertDocument();
    await insertDocument({ source_kind: "drive", storage_path: null, source_id: "drive-1", course_material_id: submission });
    expect((await db.query("select name from public.submission_documents")).rows).toHaveLength(2);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`);
    expect((await db.query("update public.submission_documents set extracted_text='Synthetic answer',extraction_status='complete' returning id")).rows).toHaveLength(2);
    expect((await db.query("delete from public.submission_documents returning id")).rows).toHaveLength(2);
  });

  it("rejects cross-owner submission and course-material links even for invited members", async () => {
    await expect(insertDocument({ user_id: member, storage_path: `${member}/${submission}/answer.pdf` })).rejects.toThrow(/foreign key/i);
    await db.exec(`reset role; insert into public.courses(id,user_id,title) values ('${member}','${member}','Other'); insert into public.course_materials(id,user_id,course_id,name,storage_path,mime_type,file_size) values ('${member}','${member}','${member}','other.pdf','path','application/pdf',12); set role authenticated;`);
    await expect(insertDocument({ source_kind: "drive", source_id: "drive-2", course_material_id: member })).rejects.toThrow(/foreign key/i);
  });

  it("enforces file metadata, source location, and version constraints", async () => {
    await insertDocument({ mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    for (const invalid of [{ file_size: 20971521 }, { file_size: 0 }, { mime_type: "text/html" }, { storage_path: null }, { source_version: " " }, { name: " " }, { source_kind: "url" }, { storage_path: `${member}/${submission}/answer.pdf` }]) {
      await expect(insertDocument(invalid)).rejects.toThrow(/check constraint/i);
    }
  });

  it("prevents duplicate upload versions and duplicate material-version links per submission", async () => {
    await insertDocument({ source_version: "sha256:upload-v1" });
    await expect(insertDocument({ source_version: "sha256:upload-v1", storage_path: `${owner}/${submission}/retry/answer.pdf` })).rejects.toThrow(/unique/i);
    await insertDocument({ source_kind: "drive", storage_path: null, source_id: "drive-1", course_material_id: submission, source_version: "2" });
    await expect(insertDocument({ source_kind: "drive", storage_path: null, source_id: "drive-1", course_material_id: submission, source_version: "2" })).rejects.toThrow(/unique/i);
  });

  it("denies outsider, unverified, and anonymous document access", async () => {
    await insertDocument();
    for (const user of [outsider, pending]) {
      await db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`);
      expect((await db.query("select id from public.submission_documents")).rows).toHaveLength(0);
      expect((await db.query("update public.submission_documents set extracted_text='Denied' returning id")).rows).toHaveLength(0);
      expect((await db.query("delete from public.submission_documents returning id")).rows).toHaveLength(0);
      await expect(insertDocument()).rejects.toThrow(/row-level security/i);
    }
    await db.exec("reset role; set role anon");
    await expect(db.query("select id from public.submission_documents")).rejects.toThrow(/permission denied/i);
    await expect(insertDocument()).rejects.toThrow(/permission denied/i);
  });

  it("keeps uploads private with size/MIME limits and submission-scoped object access", async () => {
    await db.exec("reset role");
    const bucket = await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>("select public,file_size_limit,allowed_mime_types from storage.buckets where id='submission-files'");
    expect(bucket.rows).toEqual([{ public: false, file_size_limit: 20971520, allowed_mime_types: ["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"] }]);
    await db.exec("set role authenticated");
    await db.exec(`insert into storage.objects(bucket_id,name) values ('submission-files','${owner}/${submission}/document/answer.pdf')`);
    await expect(db.exec(`insert into storage.objects(bucket_id,name) values ('submission-files','${member}/${submission}/document/answer.pdf')`)).rejects.toThrow(/row-level security/i);
    for (const path of ["answer.pdf", owner, `${owner}/${submission}`]) {
      await expect(db.query("insert into storage.objects(bucket_id,name) values ('submission-files',$1)", [path])).rejects.toThrow(/row-level security/i);
    }
    expect((await db.query("select id from storage.objects where bucket_id='submission-files'")).rows).toHaveLength(1);
    expect((await db.query("update storage.objects set name=name where bucket_id='submission-files' returning id")).rows).toHaveLength(0);
    await db.exec(`select set_config('request.jwt.claim.sub','${outsider}',false)`);
    expect((await db.query("select id from storage.objects where bucket_id='submission-files'")).rows).toHaveLength(0);
    await expect(db.exec(`insert into storage.objects(bucket_id,name) values ('submission-files','${owner}/${submission}/document/other.pdf')`)).rejects.toThrow(/row-level security/i);
  });
});
