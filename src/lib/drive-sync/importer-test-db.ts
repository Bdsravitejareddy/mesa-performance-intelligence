import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
export const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222", outsider = "33333333-3333-4333-8333-333333333333", pending = "44444444-4444-4444-8444-444444444444";
export const course = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export async function createTestDatabase(options: { submissionSearch?: boolean } = {}) {
    const db = new PGlite();
    await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,service_role;
    grant execute on function auth.uid() to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(object_name text) returns text[] language sql immutable as $$select regexp_split_to_array(object_name,'/')$$;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
    const directory = new URL("../../../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(directory)).filter(f => f.endsWith(".sql")).sort())
        await db.exec(await readFile(new URL(file, directory), "utf8"));
    // Folder-traversal tests run without the submitted-work search root unless a test opts in.
    if (!options.submissionSearch)
        await db.exec("alter table public.drive_connections alter column find_submissions set default false");
    await db.exec(`
    insert into private.workspace_access(email) values('first@example.com'),('second@example.com'),('pending@example.com');
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      ('${owner}','first@example.com',now(),'{}'),('${member}','second@example.com',now(),'{}'),
      ('${outsider}','outsider@example.com',now(),'{"email":"first@example.com"}'),('${pending}','pending@example.com',null,'{}');
    insert into public.courses(id,user_id,title) values('${course}','${owner}','Finance');
    set role service_role;
  `);
    return db;
}
