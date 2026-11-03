import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "11111111-1111-4111-8111-111111111111";
const migration = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

async function workspace(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to authenticated, service_role;
    grant execute on function auth.uid() to authenticated;
    create schema storage;
    create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(object_name text) returns text[] language sql immutable as $$ select regexp_split_to_array(object_name,'/') $$;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  await db.exec(await migration("20261019062743_create_course_intelligence_schema.sql"));
  await db.exec(await migration("20261019063732_shared_workspace_access.sql"));
  // The parts of Drive sync this migration touches.
  await db.exec(`
    alter table public.course_materials add column drive_source_id uuid, add column drive_source_version integer;
    create table public.drive_sources (id uuid primary key, current_material_id uuid, available boolean default true);
    create table public.drive_import_items (material_id uuid, status text);
    grant usage on schema private to service_role;
    grant select, delete on public.material_pages to service_role; grant select on public.course_materials, public.drive_import_items to service_role;
  `);
  await db.exec(await migration("20261103090000_material_quarantine.sql"));
  await db.exec(`
    insert into private.workspace_access(email) values ('owner@example.com');
    insert into auth.users(id,email,email_confirmed_at) values ('${OWNER}','owner@example.com',now());
    insert into public.courses(id,user_id,title) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${OWNER}','AI');
    insert into public.course_materials(id,user_id,course_id,name,storage_path,mime_type,file_size,drive_source_id) values
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${OWNER}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Week 1 slides.pdf','${OWNER}/a/week1.pdf','application/pdf',10,null),
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${OWNER}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Notes.pdf','${OWNER}/a/notes.pdf','application/pdf',10,'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    insert into public.drive_sources(id,current_material_id) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    insert into public.material_pages(user_id,material_id,page_number,extracted_text) values
      ('${OWNER}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,'Unit economics and contribution margin'),
      ('${OWNER}','cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'Setup: key AIza' || repeat('x',35) || ' for the demo');
    insert into storage.objects(bucket_id,name) values ('course-files','${OWNER}/a/week1.pdf'),('course-files','${OWNER}/a/notes.pdf');
  `);
  return db;
}

describe("material quarantine", () => {
  let db: PGlite;
  afterEach(async () => { await db?.close(); });

  it("quarantines a page with a credential pattern and hides it from every reader", async () => {
    db = await workspace();
    expect((await db.query("select material_id from private.quarantined_materials")).rows).toEqual([{ material_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }]);
    expect((await db.query<{ name: string }>("select name from public.current_course_materials")).rows.map((row) => row.name)).toEqual(["Week 1 slides.pdf"]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${OWNER}',false);`);
    expect((await db.query<{ name: string }>("select name from public.course_materials")).rows.map((row) => row.name)).toEqual(["Week 1 slides.pdf"]);
    expect((await db.query("select page_number from public.material_pages")).rows).toHaveLength(1);
    expect((await db.query<{ name: string }>("select name from storage.objects")).rows.map((row) => row.name)).toEqual([`${OWNER}/a/week1.pdf`]);
    // The member sees the name and reason in the overview, never the content.
    const overview = (await db.query<{ name: string; reason: string }>("select name, reason from public.quarantined_materials_overview()")).rows;
    expect(overview).toEqual([{ name: "Notes.pdf", reason: "A page appears to contain an API key, token or private key." }]);
    await expect(db.query("select public.purge_quarantined_material('cccccccc-cccc-4ccc-8ccc-cccccccccccc')")).rejects.toThrow();
  });

  it("lets the service role purge only a quarantined material's text, despite import immutability", async () => {
    db = await workspace();
    await db.exec("set role service_role");
    await expect(db.query("select public.purge_quarantined_material('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')")).rejects.toThrow();
    const purged = await db.query<{ purge_quarantined_material: { pages: number } }>("select public.purge_quarantined_material('cccccccc-cccc-4ccc-8ccc-cccccccccccc')");
    expect(purged.rows[0].purge_quarantined_material).toEqual({ pages: 1 });
    await db.exec("reset role");
    expect((await db.query("select 1 from public.material_pages where material_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'")).rows).toHaveLength(0);
    expect((await db.query("select name from public.course_materials where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'")).rows).toHaveLength(1);
    expect((await db.query<{ purged: boolean }>("select purged_at is not null as purged from private.quarantined_materials")).rows[0].purged).toBe(true);
  });

  it("flags files named as holding credentials, and leaves ordinary material alone", async () => {
    db = await workspace();
    await db.exec(`insert into public.course_materials(id,user_id,course_id,name,storage_path,mime_type,file_size) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${OWNER}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Gemini_API_Keys.pdf','${OWNER}/a/k.pdf','application/pdf',10)`);
    await db.exec(await migration("20261103090000_material_quarantine.sql").then((sql) => sql.slice(sql.indexOf("-- Existing materials"), sql.indexOf("-- Imported pages are otherwise immutable"))));
    expect((await db.query("select 1 from private.quarantined_materials where material_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'")).rows).toHaveLength(1);
    expect((await db.query("select 1 from private.quarantined_materials where material_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'")).rows).toHaveLength(0);
  });
});
