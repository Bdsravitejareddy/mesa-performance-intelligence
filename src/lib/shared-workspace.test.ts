import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

describe("shared private workspace", () => {
  let db: PGlite;
  afterEach(async () => { await db?.close(); });

  it("gives verified invited accounts equal access and denies outsiders or unverified accounts", async () => {
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
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    await db.exec(await readFile(new URL("../../supabase/migrations/20261019062743_create_course_intelligence_schema.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../supabase/migrations/20261019063732_shared_workspace_access.sql", import.meta.url), "utf8"));
    await db.exec(`
      insert into private.workspace_access(email) values ('first@example.com'),('second@example.com'),('pending@example.com');
      insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
        ('11111111-1111-4111-8111-111111111111','first@example.com',now(),'{}'),
        ('22222222-2222-4222-8222-222222222222','second@example.com',now(),'{}'),
        ('33333333-3333-4333-8333-333333333333','outsider@example.com',now(),'{"email":"first@example.com"}'),
        ('44444444-4444-4444-8444-444444444444','pending@example.com',null,'{}');
      insert into public.courses(id,user_id,title) values
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','First account course'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Second account course'),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','Unrelated course');
      insert into storage.objects(bucket_id,name) values
        ('course-files','11111111-1111-4111-8111-111111111111/course/a.pdf'),
        ('course-files','22222222-2222-4222-8222-222222222222/course/b.pdf'),
        ('course-files','33333333-3333-4333-8333-333333333333/course/c.pdf');
      set role authenticated;
      select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
    `);
    const first = await db.query<{ title: string }>("select title from public.courses order by title");
    expect(first.rows.map((row) => row.title)).toEqual(["First account course", "Second account course"]);
    expect((await db.query("select id from storage.objects")).rows).toHaveLength(2);
    await db.exec("select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)");
    expect((await db.query("select id from public.courses")).rows).toHaveLength(2);
    await db.exec("insert into public.assessments(user_id,course_id,title) values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Shared assessment')");
    expect((await db.query("update public.courses set title='Shared update' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id")).rows).toHaveLength(1);
    expect((await db.query("delete from public.assessments where title='Shared assessment' returning id")).rows).toHaveLength(1);
    await db.exec("insert into storage.objects(bucket_id,name) values ('course-files','22222222-2222-4222-8222-222222222222/course/new.pdf')");
    expect((await db.query("update storage.objects set name='11111111-1111-4111-8111-111111111111/course/renamed.pdf' where name='11111111-1111-4111-8111-111111111111/course/a.pdf' returning id")).rows).toHaveLength(1);
    expect((await db.query("delete from storage.objects where name='11111111-1111-4111-8111-111111111111/course/renamed.pdf' returning id")).rows).toHaveLength(1);
    await expect(db.query("select email from private.workspace_access")).rejects.toThrow();
    await db.exec("select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false)");
    expect((await db.query("select id from public.courses")).rows).toHaveLength(0);
    expect((await db.query("select id from storage.objects")).rows).toHaveLength(0);
    expect((await db.query("update public.courses set title='Denied' returning id")).rows).toHaveLength(0);
    expect((await db.query("delete from storage.objects returning id")).rows).toHaveLength(0);
    await expect(db.exec("insert into storage.objects(bucket_id,name) values ('course-files','33333333-3333-4333-8333-333333333333/course/new.pdf')")).rejects.toThrow();
    await expect(db.exec("insert into public.courses(user_id,title) values ('33333333-3333-4333-8333-333333333333','Blocked')")).rejects.toThrow();
    await db.exec("select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false)");
    expect((await db.query("select id from public.courses")).rows).toHaveLength(0);
    await expect(db.exec("insert into storage.objects(bucket_id,name) values ('course-files','44444444-4444-4444-8444-444444444444/course/new.pdf')")).rejects.toThrow();
  });
});
