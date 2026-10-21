import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migration = (name: string) => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");

describe("competency framework migration", () => {
  let db: PGlite;
  afterEach(async () => { await db?.close(); });

  it("keeps the taxonomy read-only and assessment mappings inside the verified workspace", async () => {
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
    await db.exec(await migration("20261019062743_create_course_intelligence_schema.sql"));
    await db.exec(await migration("20261019063732_shared_workspace_access.sql"));
    await db.exec(await migration("20261022120000_competency_framework.sql"));
    await db.exec(await migration("20261022140000_criterion_competency_mappings.sql"));
    await db.exec(`
      insert into private.workspace_access(email) values ('first@example.com'),('second@example.com');
      insert into auth.users(id,email,email_confirmed_at) values
        ('11111111-1111-4111-8111-111111111111','first@example.com',now()),
        ('22222222-2222-4222-8222-222222222222','second@example.com',now()),
        ('33333333-3333-4333-8333-333333333333','outsider@example.com',now());
      insert into public.courses(id,user_id,title) values
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Marketing'),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','Outsider course');
      insert into public.assessments(id,user_id,course_id,title) values
        ('a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Market sizing'),
        ('a3333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Outsider quiz');
      set role authenticated;
      select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
    `);

    const domains = await db.query<{ count: number }>("select count(distinct domain_key)::int as count from public.competencies");
    expect(domains.rows[0].count).toBe(10);
    await expect(db.exec("insert into public.competencies(id,domain_key,domain_name,name) values ('x.y','x','X','Y')")).rejects.toThrow();
    await expect(db.exec("update public.competencies set name='Changed'")).rejects.toThrow();

    // The second invited member can tag an assessment owned by the first; the row inherits the assessment owner.
    await db.exec(`insert into public.assessment_competencies(user_id,assessment_id,competency_id,mapping_source)
      values ('11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','analytical.numerical_analysis','user_tagged')`);
    const tagged = await db.query<{ tagged_by: string }>("select tagged_by from public.assessment_competencies");
    expect(tagged.rows[0].tagged_by).toBe("22222222-2222-4222-8222-222222222222");

    // Owner mismatch with the assessment is rejected by the composite foreign key.
    await expect(db.exec(`insert into public.assessment_competencies(user_id,assessment_id,competency_id,mapping_source)
      values ('22222222-2222-4222-8222-222222222222','a1111111-1111-4111-8111-111111111111','business.strategy','user_tagged')`)).rejects.toThrow();
    // Cannot tag an outsider's assessment.
    await expect(db.exec(`insert into public.assessment_competencies(user_id,assessment_id,competency_id,mapping_source)
      values ('33333333-3333-4333-8333-333333333333','a3333333-3333-4333-8333-333333333333','business.strategy','user_tagged')`)).rejects.toThrow();
    // Duplicate mapping is rejected, so re-tagging is idempotent via upsert.
    await expect(db.exec(`insert into public.assessment_competencies(user_id,assessment_id,competency_id,mapping_source)
      values ('11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','analytical.numerical_analysis','user_tagged')`)).rejects.toThrow();
    // Criterion-level tags for the same competency coexist with the whole-assessment tag, but each scope is unique.
    await db.exec(`insert into public.assessment_competencies(user_id,assessment_id,competency_id,mapping_source,criterion_label)
      values ('11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','analytical.numerical_analysis','user_tagged','Market sizing')`);
    await expect(db.exec(`insert into public.assessment_competencies(user_id,assessment_id,competency_id,mapping_source,criterion_label)
      values ('11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','analytical.numerical_analysis','user_tagged','Market sizing')`)).rejects.toThrow();
    await expect(db.exec(`insert into public.assessment_competencies(user_id,assessment_id,competency_id,mapping_source,criterion_label)
      values ('11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','analytical.logical_reasoning','user_tagged','  ')`)).rejects.toThrow();
    // An accepted AI suggestion must carry its rationale.
    await expect(db.exec(`insert into public.assessment_competencies(user_id,assessment_id,competency_id,mapping_source,review_status)
      values ('11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','business.finance','ai_suggested','accepted')`)).rejects.toThrow();

    await db.exec("select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false)");
    expect((await db.query("select id from public.assessment_competencies")).rows).toHaveLength(0);
    expect((await db.query("select id from public.competencies")).rows).toHaveLength(0);
  });
});
