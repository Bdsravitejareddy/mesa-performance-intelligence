import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "11111111-1111-4111-8111-111111111111";
const GUEST = "55555555-5555-4555-8555-555555555555";
const OTHER_GUEST = "66666666-6666-4666-8666-666666666666";
const migration = (name: string) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");

async function workspace(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
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
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  await db.exec(await migration("20261019062743_create_course_intelligence_schema.sql"));
  await db.exec(await migration("20261019063732_shared_workspace_access.sql"));
  await db.exec(await migration("20261101090000_guest_sessions.sql"));
  await db.exec(`
    insert into private.workspace_access(email) values ('owner@example.com');
    insert into auth.users(id,email,email_confirmed_at) values
      ('${OWNER}','owner@example.com',now()),
      ('${GUEST}','guest-a@guest.mesa-performance.invalid',now()),
      ('${OTHER_GUEST}','guest-b@guest.mesa-performance.invalid',now());
    insert into public.courses(id,user_id,title) values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${OWNER}','Keep'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${OWNER}','Edit me'),
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${OWNER}','Delete me'),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${OWNER}','Owner later');
    insert into public.assessments(user_id,course_id,title) values ('${OWNER}','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Cascaded with its course');
    insert into storage.objects(bucket_id,name) values ('course-files','${OWNER}/course/owner.pdf');
    select public.start_guest_session('${GUEST}','guest-a@guest.mesa-performance.invalid',now() + interval '2 hours');
    select public.start_guest_session('${OTHER_GUEST}','guest-b@guest.mesa-performance.invalid',now() + interval '2 hours');
  `);
  return db;
}

const as = (db: PGlite, user: string) => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
const titles = async (db: PGlite) => (await db.query<{ title: string }>("select title from public.courses order by title")).rows.map((row) => row.title);

describe("guest sessions", () => {
  let db: PGlite;
  afterEach(async () => { await db?.close(); });

  it("lets a guest work like a member, then undoes exactly the guest's changes", async () => {
    db = await workspace();
    await as(db, GUEST);
    expect(await titles(db)).toHaveLength(4);
    await db.exec(`
      update public.courses set title='Guest edit' where title='Edit me';
      delete from public.courses where title='Delete me';
      insert into public.courses(user_id,title) values ('${OWNER}','Guest new');
      update public.courses set title='Guest D' where title='Owner later';
      insert into storage.objects(bucket_id,name) values ('course-files','${GUEST}/course/guest.pdf');
    `);
    // A guest cannot touch the member's stored files, whose contents could not be restored.
    expect((await db.query(`delete from storage.objects where name='${OWNER}/course/owner.pdf' returning id`)).rows).toHaveLength(0);
    expect((await db.query(`update storage.objects set name='${OWNER}/course/moved.pdf' where name='${OWNER}/course/owner.pdf' returning id`)).rows).toHaveLength(0);
    await expect(db.exec(`insert into storage.objects(bucket_id,name) values ('course-files','${OWNER}/course/planted.pdf')`)).rejects.toThrow();
    // A second guest's work is separate.
    await as(db, OTHER_GUEST);
    await db.exec("update public.courses set title='Other guest' where title='Keep'");
    // The member changes a row the guest also changed; that later work must survive the undo.
    await as(db, OWNER);
    await db.exec("update public.courses set title='Owner newer' where title='Guest D'");
    await db.exec("reset role");

    const result = await db.query<{ end_guest_session: { reverted: number; skipped: number; ended: boolean } }>(`select public.end_guest_session('${GUEST}')`);
    expect(result.rows[0].end_guest_session).toMatchObject({ reverted: 4, skipped: 1, ended: true });
    expect(await titles(db)).toEqual(["Delete me", "Edit me", "Other guest", "Owner newer"]);
    expect((await db.query("select title from public.assessments")).rows).toEqual([{ title: "Cascaded with its course" }]);
    expect((await db.query(`select 1 from private.guest_changes where guest_id='${GUEST}'`)).rows).toHaveLength(0);
    expect((await db.query("select email from private.workspace_access order by email")).rows.map((row) => (row as { email: string }).email)).toEqual(["guest-b@guest.mesa-performance.invalid", "owner@example.com"]);
    // Ending again does nothing, and the ended guest no longer sees the workspace.
    expect((await db.query<{ end_guest_session: { ended: boolean } }>(`select public.end_guest_session('${GUEST}')`)).rows[0].end_guest_session.ended).toBe(false);
    await as(db, GUEST);
    expect(await titles(db)).toHaveLength(0);
    await db.exec("reset role");
    await db.query(`select public.end_guest_session('${OTHER_GUEST}')`);
    expect(await titles(db)).toEqual(["Delete me", "Edit me", "Keep", "Owner newer"]);
  });

  it("does not log the member's own changes and lists only expired guest sessions", async () => {
    db = await workspace();
    await as(db, OWNER);
    await db.exec("update public.courses set title='Owner edit' where title='Keep'");
    await db.exec("reset role");
    expect((await db.query("select 1 from private.guest_changes")).rows).toHaveLength(0);
    expect((await db.query("select * from public.expired_guest_sessions()")).rows).toHaveLength(0);
    await db.exec(`update private.guest_sessions set expires_at = now() - interval '1 minute' where user_id='${GUEST}'`);
    expect((await db.query<{ expired_guest_sessions: string }>("select * from public.expired_guest_sessions()")).rows.map((row) => row.expired_guest_sessions)).toEqual([GUEST]);
  });

  it("limits failed guest sign-ins per client and keeps the functions server-only", async () => {
    db = await workspace();
    for (let attempt = 0; attempt < 5; attempt += 1) await db.query("select public.record_guest_login('client-a', false)");
    expect((await db.query<{ guest_login_allowed: boolean }>("select public.guest_login_allowed('client-a')")).rows[0].guest_login_allowed).toBe(false);
    expect((await db.query<{ guest_login_allowed: boolean }>("select public.guest_login_allowed('client-b')")).rows[0].guest_login_allowed).toBe(true);
    await as(db, OWNER);
    await expect(db.query(`select public.end_guest_session('${GUEST}')`)).rejects.toThrow();
    await expect(db.query(`select public.start_guest_session('${OWNER}','x@example.com',now())`)).rejects.toThrow();
  });
});
