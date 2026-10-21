import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = fileURLToPath(
  new URL("../../supabase/migrations/20261019062743_create_course_intelligence_schema.sql", import.meta.url),
);

describe("Supabase migration access boundaries", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it("applies the schema and restricts course rows to the authenticated owner", async () => {
    database = new PGlite();
    await database.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      create schema storage;
      create table storage.buckets (
        id text primary key, name text not null, public boolean not null,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
      alter table storage.objects enable row level security;
      create function storage.foldername(object_name text) returns text[] language sql immutable as
        $$ select regexp_split_to_array(object_name, '/') $$;
      grant usage on schema storage to authenticated;
      grant select, insert, update, delete on storage.objects to authenticated;
      grant usage on schema public to authenticated;
    `);

    const migration = await readFile(migrationPath, "utf8");
    await database.exec(migration);
    await database.exec(await readFile(new URL("../../supabase/migrations/20261022090001_role_benchmark_sources.sql", import.meta.url), "utf8"));
    await database.exec(`
      insert into auth.users (id) values
        ('11111111-1111-4111-8111-111111111111'),
        ('22222222-2222-4222-8222-222222222222');
      insert into public.courses (user_id, code, title) values
        ('11111111-1111-4111-8111-111111111111', 'MKT-1', 'Marketing Analytics'),
        ('22222222-2222-4222-8222-222222222222', 'FIN-1', 'Corporate Finance');
      insert into storage.objects (bucket_id, name) values
        ('course-files', '11111111-1111-4111-8111-111111111111/course/notes.pdf'),
        ('course-files', '22222222-2222-4222-8222-222222222222/course/answer-key.pdf');
      set role authenticated;
      select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
    `);

    const visibleCourses = await database.query<{ title: string }>("select title from public.courses order by title");
    const visibleFiles = await database.query<{ name: string }>("select name from storage.objects order by name");
    expect(visibleCourses.rows.map((row) => row.title)).toEqual(["Marketing Analytics"]);
    expect(visibleFiles.rows.map((row) => row.name)).toEqual([
      "11111111-1111-4111-8111-111111111111/course/notes.pdf",
    ]);

    await database.query("insert into public.role_profiles (user_id, title, employer, source_url, retrieved_at, posting_date, is_verified, source_content_hash, competencies) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [
      "11111111-1111-4111-8111-111111111111", "Senior Technical Product Manager", "Example Health", "https://careers.example.org/role", "2026-10-22T10:00:00Z", "2026-10-01", true, "sha256", JSON.stringify([{ title: "FHIR", description: "Integrations", sourceQuote: "FHIR integrations", evidenceKind: "required" }]),
    ]);
    const role = await database.query<{ employer: string; source_url: string; posting_date: string; is_verified: boolean; competencies: Array<{ sourceQuote: string }> }>("select employer, source_url, posting_date::text, is_verified, competencies from public.role_profiles");
    expect(role.rows).toEqual([{ employer: "Example Health", source_url: "https://careers.example.org/role", posting_date: "2026-10-01", is_verified: true, competencies: [{ title: "FHIR", description: "Integrations", sourceQuote: "FHIR integrations", evidenceKind: "required" }] }]);
    await expect(database.query("insert into public.role_profiles (user_id, title) values ($1, 'Cross-owner profile')", ["22222222-2222-4222-8222-222222222222"])).rejects.toThrow(/row-level security/i);

    await database.exec(`insert into public.courses (user_id, code, title) values ('11111111-1111-4111-8111-111111111111', 'MKT-2', 'Second Marketing Course');`);
    const firstCourse = await database.query<{ id: string }>("select id from public.courses where title = 'Marketing Analytics'");
    const secondCourse = await database.query<{ id: string }>("select id from public.courses where title = 'Second Marketing Course'");
    await database.query("insert into public.assessments (user_id, course_id, title) values ($1, $2, 'Course one assessment')", ["11111111-1111-4111-8111-111111111111", firstCourse.rows[0].id]);
    const assessment = await database.query<{ id: string }>("select id from public.assessments where title = 'Course one assessment'");
    await expect(database.query(
      "insert into public.course_materials (user_id, course_id, assessment_id, name, storage_path, mime_type, file_size) values ($1, $2, $3, 'cross-linked.pdf', 'path', 'application/pdf', 12)",
      ["11111111-1111-4111-8111-111111111111", secondCourse.rows[0].id, assessment.rows[0].id],
    )).rejects.toThrow();
  });
});
