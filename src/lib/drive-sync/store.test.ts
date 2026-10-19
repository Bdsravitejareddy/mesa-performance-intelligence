import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const pending = "44444444-4444-4444-8444-444444444444";
const course = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let db: PGlite;
async function rpc<T = Record<string, unknown>>(name: string, args: unknown[] = []): Promise<T> {
  const result = await db.query<{ value: T }>(`select public.drive_sync_${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args.map(a => typeof a === "object" && a !== null ? JSON.stringify(a) : a));
  return result.rows[0].value;
}
async function configure(userId = owner) {
  return rpc<{id:string; mappings:{id:string}[]}>("configure", [userId, null, [{driveFolderId:"root", mode:"course", courseId:course, rootCourseTitle:"Finance"}]]);
}
async function scan(connectionId: string) {
  return rpc<{scanId:string; mappings:{id:string}[]}>("start_scan", [connectionId]);
}
function source(folderMappingId: string, fingerprint = "v1", driveFileId = "file") {
  return {driveFileId, name:"notes.pdf", mimeType:"application/pdf", parentId:"root", sourceUrl:"https://drive.google.com/file/d/file/view", fingerprint, folderMappingId, courseFolderId:"root", courseFolderTitle:"Finance"};
}
async function reserve(connectionId: string, scanId: string, mappingId: string, fingerprint = "v1", driveFileId = "file") {
  return rpc<{decision:string; itemId:string; storagePath:string}>("reserve", [connectionId, scanId, source(mappingId, fingerprint, driveFileId)]);
}
const pages = [{pageNumber:1, text:"Discount cash flows", tables:[], hasVisuals:false}];
beforeEach(async () => {
  db = new PGlite();
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
  for (const file of (await readdir(directory)).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, directory), "utf8"));
  await db.exec(`
    insert into private.workspace_access(email) values('first@example.com'),('second@example.com'),('pending@example.com');
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      ('${owner}','first@example.com',now(),'{}'),('${member}','second@example.com',now(),'{}'),
      ('${outsider}','outsider@example.com',now(),'{"email":"first@example.com"}'),('${pending}','pending@example.com',null,'{}');
    insert into public.courses(id,user_id,title) values('${course}','${owner}','Finance');
    set role service_role;
  `);
});
afterEach(async () => { await db.close(); });

describe("transactional Drive sync state", () => {

  it("isolates persistent caller and code pairing budgets and does not charge blocked callers globally", async () => {
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const attempt = (caller: string, code: string) => rpc("attempt_pairing_scoped", [hash(caller), hash(code)]);
    for (let i = 0; i < 10; i++) expect(await attempt("abuser", `guess-${i}`)).toBe(true);
    for (let i = 0; i < 20; i++) expect(await attempt("abuser", `blocked-${i}`)).toBe(false);
    expect(await attempt("first-member", "valid-first")).toBe(true);
    expect(await attempt("second-member", "valid-second")).toBe(true);
    for (let i = 0; i < 10; i++) expect(await attempt(`distributed-${i}`, "same-code")).toBe(true);
    expect(await attempt("another-caller", "same-code")).toBe(false);
    expect(await attempt("another-caller", "fresh-code")).toBe(true);
    const global = hash("drive-agent-pair-global");
    expect((await db.query<{attempt_count:number}>("select attempt_count from private.drive_pairing_attempts where key_hash=$1", [global])).rows[0].attempt_count).toBe(23);
  });

  it("enforces a durable high global pairing ceiling across isolated callers and resets after 15 minutes", async () => {
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const global = hash("drive-agent-pair-global");
    // Seed close to the ceiling to verify the boundary without 1000 round trips.
    await db.query("insert into private.drive_pairing_attempts(key_hash,attempt_count) values($1,999)", [global]);
    expect(await rpc("attempt_pairing_scoped", [hash("caller-a"), hash("code-a")])).toBe(true);
    expect(await rpc("attempt_pairing_scoped", [hash("caller-b"), hash("code-b")])).toBe(false);
    expect(await rpc("attempt_pairing_scoped", [hash("caller-c"), hash("code-c")])).toBe(false);
    await db.exec("update private.drive_pairing_attempts set window_started_at=now()-interval '16 minutes'");
    expect(await rpc("attempt_pairing_scoped", [hash("caller-d"), hash("code-d")])).toBe(true);
  });

  it("checks the expected revision atomically before concurrent configuration updates", async () => {
    const original = [{ driveFolderId:"root", mode:"course", courseId:course, rootCourseTitle:"Finance" }];
    const connection = await rpc<{id:string;mappingRevision:number}>("configure", [owner,null,original]);
    const revised = [{ ...original[0], driveFolderId:"replacement" }];
    const outcomes = await Promise.allSettled([
      rpc("configure_if_current", [owner, connection.id, revised, "Paused", false, connection.mappingRevision]),
      rpc("configure_if_current", [member, connection.id, original, "Stale rename", true, connection.mappingRevision]),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const stale = outcomes.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(stale.reason).toMatchObject({ code: "40001" });
    expect((await db.query("select label,enabled,mapping_revision from public.drive_connections where id=$1", [connection.id])).rows).toEqual([{label:"Paused",enabled:false,mapping_revision:2}]);
    expect((await db.query("select drive_folder_id from public.drive_folder_mappings where connection_id=$1 and enabled", [connection.id])).rows).toEqual([{drive_folder_id:"replacement"}]);
    await expect(rpc("configure_if_current", [owner, connection.id, original, "No revision", true, null])).rejects.toThrow();
  });

  it("keeps cross-scan leases exclusive while allowing same-scan upload resumption", async () => {
    const connection = await configure(), run = await scan(connection.id);
    const item = await reserve(connection.id,run.scanId,run.mappings[0].id);
    expect(await reserve(connection.id,run.scanId,run.mappings[0].id)).toEqual(item);
    expect((await reserve(connection.id,run.scanId,run.mappings[0].id,"v2")).decision).toBe("retry_later");
    await rpc("checkpoint",[connection.id,run.scanId,{roots:{[run.mappings[0].id]:{failed:true,completed:false,pendingFolders:[],pendingFiles:[]}}},[]]);
    const next = await scan(connection.id);
    expect((await reserve(connection.id,next.scanId,next.mappings[0].id)).decision).toBe("retry_later");
  });

  it("invalidates previously authorized publication and scans when issuing a new pairing", async () => {
    const connection = await configure();
    await rpc("issue_pairing",[connection.id,"a".repeat(64),new Date(Date.now()+60e3).toISOString()]);
    await rpc("consume_pairing",["a".repeat(64),"b".repeat(64)]);
    const run = await scan(connection.id), item = await reserve(connection.id,run.scanId,run.mappings[0].id);
    await rpc("issue_pairing",[connection.id,"c".repeat(64),new Date(Date.now()+60e3).toISOString()]);
    expect(await rpc("authenticate",["b".repeat(64)])).toBeNull();
    await expect(rpc("publish",[connection.id,item.itemId,pages,12])).rejects.toThrow();
    await expect(reserve(connection.id,run.scanId,run.mappings[0].id)).rejects.toThrow();
    const next = await scan(connection.id), replacement = await reserve(connection.id,next.scanId,next.mappings[0].id);
    expect(replacement.decision).toBe("upload");
    expect(replacement.itemId).not.toBe(item.itemId);
  });


  it("continues draining a failed root before terminating its daily scan", async () => {
    const connection = await configure(), run = await scan(connection.id);
    const rootId = run.mappings[0].id;
    const value = {roots:{[rootId]:{failed:true,completed:false,pendingFolders:[{id:"sibling",courseFolderId:"root",courseFolderTitle:"Finance"}],pendingFiles:[] as ReturnType<typeof source>[],visitedFolderIds:[]}}};
    await rpc("checkpoint",[connection.id,run.scanId,value,[]]);
    expect((await scan(connection.id)).scanId).toBe(run.scanId);
    value.roots[rootId].pendingFolders=[];
    value.roots[rootId].pendingFiles=[source(rootId)];
    await rpc("checkpoint",[connection.id,run.scanId,value,[]]);
    expect((await scan(connection.id)).scanId).toBe(run.scanId);
    value.roots[rootId].pendingFiles=[];
    await rpc("checkpoint",[connection.id,run.scanId,value,[]]);
    expect((await scan(connection.id)).scanId).not.toBe(run.scanId);
  });


  it("denies client-forged import provenance and moving manual pages into imported versions", async () => {
    const connection = await configure(), run = await scan(connection.id);
    const item = await reserve(connection.id,run.scanId,run.mappings[0].id);
    const imported = await rpc<{materialId:string}>("publish",[connection.id,item.itemId,pages,12]);
    const sourceId = (await db.query<{id:string}>("select id from public.drive_sources")).rows[0].id;
    const manual = (await db.query<{id:string}>("insert into public.course_materials(user_id,course_id,name,storage_path,mime_type,file_size) values($1,$2,'manual.pdf','manual','application/pdf',12) returning id",[owner,course])).rows[0].id;
    const manualPage = (await db.query<{id:string}>("insert into public.material_pages(user_id,material_id,page_number) values($1,$2,1) returning id",[owner,manual])).rows[0].id;
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${member}',false)`);
    await expect(db.query("insert into public.course_materials(user_id,course_id,name,storage_path,mime_type,file_size,drive_source_id,drive_source_version,version) values($1,$2,'forged.pdf','forged','application/pdf',12,$3,2,2)",[owner,course,sourceId])).rejects.toThrow();
    await expect(db.query("update public.course_materials set drive_source_id=$1,drive_source_version=2,version=2 where id=$2",[sourceId,manual])).rejects.toThrow();
    await expect(db.query("update public.material_pages set material_id=$1 where id=$2",[imported.materialId,manualPage])).rejects.toThrow();
    expect((await db.query<{name:string}>("update public.course_materials set name='renamed.pdf' where id=$1 returning name",[manual])).rows).toEqual([{name:"renamed.pdf"}]);
  });


  it("keeps every connector RPC invoker-only and denies client roles across the RPC surface", async () => {
    const result = await db.query<{proname:string;prosecdef:boolean;authenticated:boolean;anon:boolean}>(`select p.proname,p.prosecdef,has_function_privilege('authenticated',p.oid,'execute') as authenticated,has_function_privilege('anon',p.oid,'execute') as anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'drive_sync_%'`);
    expect(result.rows.length).toBeGreaterThan(10);
    for(const row of result.rows) {
      expect(row.prosecdef).toBe(false);
      expect(row.authenticated).toBe(row.proname === "drive_sync_workspace_member");
      expect(row.anon).toBe(false);
    }
  });

  it("reuses server-created courses on reconfiguration and groups collection files by course folder", async () => {
    const mappings = [{driveFolderId:"new-root",mode:"course",rootCourseTitle:"Auto course"}];
    const connection = await rpc<{id:string;mappings:{courseId:string}[]}>("configure",[owner,null,mappings]);
    const updated = await rpc<{mappings:{courseId:string}[]}>("configure",[owner,connection.id,mappings]);
    expect(updated.mappings[0].courseId).toBe(connection.mappings[0].courseId);
    const collection = await rpc<{id:string}>("configure",[member,null,[{driveFolderId:"collection",mode:"collection",rootCourseTitle:"Shared Collection"}]]);
    const run = await scan(collection.id);
    const first = await reserve(collection.id,run.scanId,run.mappings[0].id,"v1","one");
    const second = await reserve(collection.id,run.scanId,run.mappings[0].id,"v1","two");
    await rpc("publish",[collection.id,first.itemId,pages,12]);
    await rpc("publish",[collection.id,second.itemId,pages,12]);
    expect((await db.query("select distinct course_id from public.drive_sources where connection_id=$1",[collection.id])).rows).toHaveLength(1);
    expect((await db.query<{user_id:string}>("select distinct user_id from public.course_materials")).rows).toEqual([{user_id:member}]);
  });

  it("rejects changed course destinations rather than silently moving imported history", async () => {
    const connection = await configure(), run = await scan(connection.id);
    const item = await reserve(connection.id,run.scanId,run.mappings[0].id);
    await rpc("publish",[connection.id,item.itemId,pages,12]);
    const otherCourse = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await db.exec(`insert into public.courses(id,user_id,title) values('${otherCourse}','${member}','Second course')`);
    await rpc("configure",[owner,connection.id,[{driveFolderId:"root",mode:"course",courseId:otherCourse,rootCourseTitle:"Second course"}]]);
    const next = await scan(connection.id);
    expect((await reserve(connection.id,next.scanId,next.mappings[0].id)).decision).toBe("conflict");
    expect((await db.query<{course_id:string}>("select course_id from public.course_materials")).rows).toEqual([{course_id:course}]);
  });


  it("checks workspace invitation for empty-state UI and atomically disables configured connections", async () => {
    const connection = await configure();
    await rpc("issue_pairing",[connection.id,"a".repeat(64),new Date(Date.now()+60e3).toISOString()]);
    await rpc("consume_pairing",["a".repeat(64),"b".repeat(64)]);
    await rpc("configure",[owner,connection.id,[{driveFolderId:"root",mode:"course",courseId:course,rootCourseTitle:"Finance"}],"Disabled",false]);
    expect(await rpc("authenticate",["b".repeat(64)])).toBeNull();
    for(const user of [owner,member,outsider,pending]) {
      await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`);
      expect(await rpc("workspace_member")).toBe([owner,member].includes(user));
    }
    await db.exec("reset role; set role anon");
    await expect(rpc("workspace_member")).rejects.toThrow();
  });


  it("persists connection labels and limits pairing attempts across request instances", async () => {
    const connection = await rpc<{id:string;label:string}>("configure",[owner,null,[{driveFolderId:"root",mode:"course",courseId:course,rootCourseTitle:"Finance"}],"Student Drive"]);
    expect(connection.label).toBe("Student Drive");
    for(let n=0;n<10;n++) expect(await rpc("attempt_pairing",["e".repeat(64)])).toBe(true);
    expect(await rpc("attempt_pairing",["e".repeat(64)])).toBe(false);
    expect(await rpc("attempt_pairing",["f".repeat(64)])).toBe(true);
    await db.exec("update private.drive_pairing_attempts set window_started_at=now()-interval '16 minutes'");
    expect(await rpc("attempt_pairing",["e".repeat(64)])).toBe(true);
  });

  it("records per-file errors, abandons leases, and makes terminal failed scans restartable", async () => {
    const connection = await configure(), run = await scan(connection.id);
    const item = await reserve(connection.id,run.scanId,run.mappings[0].id);
    await rpc("record_error",[connection.id,"Could not parse document",item.itemId]);
    expect((await db.query<{status:string;attempt_count:number}>("select status,attempt_count from public.drive_import_items")).rows).toEqual([{status:"expired",attempt_count:1}]);
    await rpc("checkpoint",[connection.id,run.scanId,{roots:{[run.mappings[0].id]:{failed:true,completed:false}}},[]]);
    expect((await scan(connection.id)).scanId).not.toBe(run.scanId);
  });

  it("records unsupported source inventory without reserving uploads", async () => {
    const connection = await configure(), run = await scan(connection.id);
    expect(await rpc("reserve",[connection.id,run.scanId,{...source(run.mappings[0].id),mimeType:"image/png",name:"diagram.png"}])).toEqual({decision:"unsupported"});
    expect((await db.query("select id from public.drive_sources")).rows).toHaveLength(1);
    expect((await db.query("select id from public.drive_import_items")).rows).toHaveLength(0);
  });


  it("rejects malformed hashes and leaves the pairing usable after failed consumption", async () => {
    const connection = await configure();
    await expect(rpc("issue_pairing",[connection.id,null,new Date(Date.now()+60e3).toISOString()])).rejects.toThrow();
    await rpc("issue_pairing",[connection.id,"a".repeat(64),new Date(Date.now()+60e3).toISOString()]);
    await expect(rpc("consume_pairing",["a".repeat(64),null])).rejects.toThrow();
    expect(await rpc("consume_pairing",["a".repeat(64),"b".repeat(64)])).toEqual({connectionId:connection.id,userId:owner});
  });

  it("rejects oversized checkpoints and failed root completion without changing persisted progress", async () => {
    const connection = await configure(), run = await scan(connection.id);
    await rpc("checkpoint",[connection.id,run.scanId,{roots:{pending:true}},[]]);
    await expect(rpc("checkpoint",[connection.id,run.scanId,{roots:{large:"x".repeat(262144)}},[]])).rejects.toThrow(/capacity/i);
    await expect(rpc("checkpoint",[connection.id,run.scanId,{roots:{[run.mappings[0].id]:{failed:true,completed:false}}},[run.mappings[0].id]])).rejects.toThrow();
    expect((await rpc<{checkpoint:unknown}>("start_scan",[connection.id])).checkpoint).toEqual({roots:{pending:true}});
  });

  it("protects imported pages and publishes availability progressively without inferring missing files", async () => {
    const connection = await configure(), run = await scan(connection.id);
    const item = await reserve(connection.id,run.scanId,run.mappings[0].id);
    expect((await db.query<{available:boolean}>("select available from public.drive_sources")).rows[0].available).toBe(false);
    const published = await rpc<{materialId:string}>("publish",[connection.id,item.itemId,pages,12]);
    expect((await db.query<{available:boolean}>("select available from public.drive_sources")).rows[0].available).toBe(true);
    await expect(db.query("insert into public.material_pages(user_id,material_id,page_number,extracted_text) values($1,$2,2,'Forged')",[owner,published.materialId])).rejects.toThrow();
    await rpc("checkpoint",[connection.id,run.scanId,{roots:{}},[run.mappings[0].id]]);
    const missing = await scan(connection.id);
    await rpc("checkpoint",[connection.id,missing.scanId,{roots:{}},[missing.mappings[0].id]]);
    const reappeared = await scan(connection.id);
    await reserve(connection.id,reappeared.scanId,reappeared.mappings[0].id);
    expect((await db.query<{available:boolean}>("select available from public.drive_sources")).rows[0].available).toBe(true);
    await rpc("checkpoint",[connection.id,reappeared.scanId,{roots:{}},[reappeared.mappings[0].id]]);
    expect((await db.query<{available:boolean}>("select available from public.drive_sources")).rows[0].available).toBe(true);
  });

  it("lets shared members read state but hides credentials and forbids client RPC mutation", async () => {
    const connection = await configure();
    await rpc("issue_pairing", [connection.id, "a".repeat(64), new Date(Date.now()+14*60e3).toISOString()]);
    for (const user of [owner, member, outsider, pending]) {
      await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`);
      expect((await db.query("select id from public.drive_connections")).rows).toHaveLength([owner,member].includes(user) ? 1 : 0);
      await expect(db.query("select * from private.drive_credentials")).rejects.toThrow();
      await expect(rpc("authenticate", ["b".repeat(64)])).rejects.toThrow();
    }
    await db.exec("reset role; set role anon");
    await expect(rpc("start_scan", [connection.id])).rejects.toThrow();
  });

  it("consumes a hashed pairing once, caps its expiry, and authenticates without auth.uid", async () => {
    const connection = await configure();
    await expect(rpc("issue_pairing", [connection.id,"a".repeat(64),new Date(Date.now()+16*60e3).toISOString()])).rejects.toThrow();
    await rpc("issue_pairing", [connection.id,"a".repeat(64),new Date(Date.now()+14*60e3).toISOString()]);
    expect(await rpc("consume_pairing", ["a".repeat(64),"b".repeat(64)])).toEqual({connectionId:connection.id,userId:owner});
    await expect(rpc("consume_pairing", ["a".repeat(64),"c".repeat(64)])).rejects.toThrow();
    expect(await rpc("authenticate", ["b".repeat(64)])).toEqual({connectionId:connection.id,userId:owner});
    expect(await rpc("authenticate", ["c".repeat(64)])).toBeNull();
    const credentials = await db.query<{pairing_hash:null;token_hash:string}>("select pairing_hash,token_hash from private.drive_credentials");
    expect(credentials.rows).toEqual([{pairing_hash:null,token_hash:"b".repeat(64)}]);
    await rpc("issue_pairing",[connection.id,"d".repeat(64),new Date(Date.now()+60e3).toISOString()]);
    expect(await rpc("authenticate",["b".repeat(64)])).toBeNull();
  });

  it("rejects expired pairing and permits only one concurrent consumer", async () => {
    const connection = await configure();
    await rpc("issue_pairing", [connection.id,"a".repeat(64),new Date(Date.now()+60e3).toISOString()]);
    await db.exec("update private.drive_credentials set pairing_expires_at=now()-interval '1 second'");
    await expect(rpc("consume_pairing", ["a".repeat(64),"b".repeat(64)])).rejects.toThrow();
    await rpc("issue_pairing", [connection.id,"a".repeat(64),new Date(Date.now()+60e3).toISOString()]);
    const results = await Promise.allSettled([rpc("consume_pairing", ["a".repeat(64),"b".repeat(64)]),rpc("consume_pairing", ["a".repeat(64),"c".repeat(64)])]);
    expect(results.filter(r=>r.status === "fulfilled")).toHaveLength(1);
  });

  it("checks invited verified owners on service operations and rejects cross-owner courses", async () => {
    for (const user of [outsider,pending]) await expect(configure(user)).rejects.toThrow();
    const shared = await configure(member);
    const run = await scan(shared.id);
    const item = await reserve(shared.id,run.scanId,run.mappings[0].id);
    await rpc("publish",[shared.id,item.itemId,pages,12]);
    expect((await db.query<{user_id:string}>("select user_id from public.course_materials")).rows[0].user_id).toBe(owner);
    await db.exec(`reset role; delete from private.workspace_access where email='second@example.com'; set role service_role`);
    await expect(scan(shared.id)).rejects.toThrow();
    await db.exec(`reset role; insert into public.courses(id,user_id,title) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${outsider}','Unrelated'); set role service_role`);
    await expect(rpc("configure",[owner,null,[{driveFolderId:"x",mode:"course",courseId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",rootCourseTitle:"X"}]])).rejects.toThrow();
  });

  it("enforces global file/export identity and five minute leases across connections", async () => {
    const first = await configure(), second = await configure(member);
    const a = await scan(first.id), b = await scan(second.id);
    const item = await reserve(first.id,a.scanId,a.mappings[0].id);
    expect(item.decision).toBe("upload");
    const resumed = await reserve(first.id,a.scanId,a.mappings[0].id);
    expect(resumed).toEqual(item);
    expect((await reserve(second.id,b.scanId,b.mappings[0].id)).decision).toBe("conflict");
    await db.exec("update public.drive_import_items set lease_expires_at=now()-interval '1 second'");
    await expect(rpc("publish",[first.id,item.itemId,pages,12])).rejects.toThrow();
    const recovered = await reserve(first.id,a.scanId,a.mappings[0].id);
    expect(recovered.decision).toBe("upload");
    expect(recovered.itemId).not.toBe(item.itemId);
    expect((await db.query("select * from public.drive_sources")).rows).toHaveLength(1);
  });

  it("publishes atomically, retains immutable prior versions, and repeats publication idempotently", async () => {
    const connection = await configure(), run = await scan(connection.id);
    const item = await reserve(connection.id,run.scanId,run.mappings[0].id);
    const first = await rpc<{materialId:string;version:number}>("publish",[connection.id,item.itemId,pages,12]);
    expect(first.version).toBe(1);
    expect(await rpc("publish",[connection.id,item.itemId,pages,12])).toEqual(first);
    expect((await reserve(connection.id,run.scanId,run.mappings[0].id)).decision).toBe("unchanged");
    const replacement = await reserve(connection.id,run.scanId,run.mappings[0].id,"v2");
    await expect(rpc("publish",[connection.id,replacement.itemId,[{...pages[0],pageNumber:0}],24])).rejects.toThrow();
    expect((await db.query<{current_material_id:string}>("select current_material_id from public.drive_sources")).rows[0].current_material_id).toBe(first.materialId);
    expect((await db.query("select * from public.course_materials")).rows).toHaveLength(1);
    const next = await rpc<{materialId:string;version:number}>("publish",[connection.id,replacement.itemId,pages,24]);
    expect(next.version).toBe(2);
    expect((await db.query("select * from public.course_materials")).rows).toHaveLength(2);
    await expect(db.query("update public.course_materials set name='Changed' where id=$1",[first.materialId])).rejects.toThrow();
    await expect(db.query("delete from public.material_pages where material_id=$1",[first.materialId])).rejects.toThrow();
  });

  it("rejects cross-connection, stale mapping revisions, disabled connections and revoked tokens", async () => {
    const connection = await configure(), other = await configure(member), run = await scan(connection.id);
    const item = await reserve(connection.id,run.scanId,run.mappings[0].id);
    await expect(rpc("publish",[other.id,item.itemId,pages,12])).rejects.toThrow();
    await rpc("configure",[owner,connection.id,[{driveFolderId:"root",mode:"course",courseId:course,rootCourseTitle:"Finance"}]]);
    await expect(rpc("publish",[connection.id,item.itemId,pages,12])).rejects.toThrow();
    await expect(reserve(connection.id,run.scanId,run.mappings[0].id)).rejects.toThrow();
    await rpc("issue_pairing",[connection.id,"a".repeat(64),new Date(Date.now()+60e3).toISOString()]);
    await rpc("consume_pairing",["a".repeat(64),"b".repeat(64)]);
    await rpc("revoke",[connection.id]);
    expect(await rpc("authenticate",["b".repeat(64)])).toBeNull();
    await expect(scan(connection.id)).rejects.toThrow();
  });

  it("changes availability only after successful complete root traversal and keeps historical records", async () => {
    const connection = await configure(), first = await scan(connection.id);
    const item = await reserve(connection.id,first.scanId,first.mappings[0].id);
    await rpc("publish",[connection.id,item.itemId,pages,12]);
    await rpc("checkpoint",[connection.id,first.scanId,{roots:{}},[first.mappings[0].id]]);
    const second = await scan(connection.id);
    await rpc("checkpoint",[connection.id,second.scanId,{roots:{pending:true}},[]]);
    expect((await db.query<{available:boolean}>("select available from public.drive_sources")).rows[0].available).toBe(true);
    await rpc("checkpoint",[connection.id,second.scanId,{roots:{}},[second.mappings[0].id]]);
    expect((await db.query<{available:boolean}>("select available from public.drive_sources")).rows[0].available).toBe(false);
    expect((await db.query("select * from public.course_materials")).rows).toHaveLength(1);
  });
});
