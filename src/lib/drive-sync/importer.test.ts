import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";
import JSZip from "jszip";
import { extractPdfPages } from "../documents";
import { createTestDatabase, owner, course } from "./importer-test-db";
import { DriveSyncStore } from "./store";
import type { SourceFile } from "./contracts";
import { reserveSource, createImportUpload, finalizeImport, isPermanentParseFailure, type ImportContext } from "./importer";
let db: Awaited<ReturnType<typeof createTestDatabase>>, context: ImportContext, source: SourceFile;
const objects = new Map<string, Blob>();
function client(): SupabaseClient {
    return {
        rpc: async (name: string, args: Record<string, unknown>) => {
            try {
                const values = Object.values(args).map(v => v && typeof v === 'object' ? JSON.stringify(v) : v);
                const q = await db.query<{
                    data: unknown;
                }>(`select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) as data`, values);
                return { data: q.rows[0].data, error: null };
            }
            catch (e) {
                return { data: null, error: { message: (e as Error).message } };
            }
        },
        from: (table: string) => {
            const conditions: string[] = [], values: unknown[] = [];
            let columns = '*';
            const query = {
                select: (fields: string) => { columns = fields; return query; },
                eq: (key: string, value: unknown) => { values.push(value); conditions.push(`${key}=$${values.length}`); return query; },
                maybeSingle: async () => { const result = await db.query(`select ${columns} from public.${table} where ${conditions.join(' and ')}`, values); return { data: result.rows[0] ?? null, error: null }; },
            };
            return query;
        },
        storage: { from: () => ({ exists: async (path: string) => objects.has(path) ? { data: true, error: null } : { data: false, error: { status: 400, message: 'Object not found' } }, createSignedUploadUrl: async (path: string) => objects.has(path) ? { data: null, error: { status: 409, message: 'Object already exists' } } : ({ data: { signedUrl: `https://storage.example/storage/v1/object/upload/sign/course-files/${path}?token=test` }, error: null }), download: async (path: string) => ({ data: objects.get(path) ?? null, error: null }) }) },
    } as unknown as SupabaseClient;
}
async function pdf(empty = false) { const p = await PDFDocument.create(); const page = p.addPage(); if (!empty)
    page.drawText('Cash flows', { font: await p.embedFont(StandardFonts.Helvetica) }); return new Blob([new Uint8Array(await p.save())], { type: 'application/pdf' }); }
async function uploaded(file?: Blob) { const decision = await reserveSource(context, source); if (decision.decision !== 'upload')
    throw Error('Expected upload'); objects.set(decision.storagePath, file ?? await pdf()); return decision; }
beforeEach(async () => { db = await createTestDatabase(); objects.clear(); process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://storage.example'; const c = client(), store = new DriveSyncStore(c); const connection = await store.configure(owner, null, [{ driveFolderId: 'root', mode: 'course', courseId: course, rootCourseTitle: 'Finance' }]); const scan = await store.startScan(connection.id); context = { connectionId: connection.id, userId: owner, scanId: scan.scanId, client: c, store }; source = { driveFileId: 'file', name: 'notes.pdf', mimeType: 'application/pdf', parentId: 'root', sourceUrl: 'https://drive.google.com/file/d/file/view', fingerprint: 'v1', folderMappingId: scan.mappings[0].id, courseFolderId: 'root', courseFolderTitle: 'Finance' }; });
afterEach(async () => { vi.restoreAllMocks(); await db.close(); });
describe('Drive importer', () => {
    it('publishes real parsed PDF pages atomically, resumes finalize and skips unchanged files', async () => { const item = await uploaded(); const result = await finalizeImport(context, item.itemId); expect(result).toMatchObject({ version: 1, status: 'complete' }); objects.clear(); expect(await finalizeImport(context, item.itemId)).toEqual(result); expect(await reserveSource(context, source)).toEqual({ decision: 'unchanged' }); const rows = await db.query<{
        extracted_text: string;
    }>('select extracted_text from material_pages'); expect(rows.rows[0].extracted_text).toBe('Cash flows'); source.fingerprint = 'v2'; const next = await uploaded(); expect((await finalizeImport(context, next.itemId)).version).toBe(2); expect((await db.query('select id from course_materials')).rows).toHaveLength(2); });
    it('marks a text-empty PDF needs_visual_review including idempotent retries', async () => { const i = await uploaded(await pdf(true)); const result = await finalizeImport(context, i.itemId); expect(result.status).toBe('needs_visual_review'); expect((await finalizeImport(context, i.itemId)).status).toBe('needs_visual_review'); });
    it('issues a direct private signed URL and accepts 5 MB bytes without a JSON upload body', async () => { const base = new Uint8Array(await (await pdf()).arrayBuffer()); const large = new Uint8Array(5 * 1024 * 1024); large.set(base); const i = await reserveSource(context, source); if (i.decision !== 'upload') throw Error('Expected upload'); expect(await createImportUpload(context, i.itemId)).toEqual({ signedUrl: `https://storage.example/storage/v1/object/upload/sign/course-files/${i.storagePath}?token=test`, storageOrigin: 'https://storage.example' }); objects.set(i.storagePath, new Blob([large], { type: 'application/pdf' })); expect((await finalizeImport(context, i.itemId)).status).toBe('complete'); });
    it('directs an existing uploaded object to finalize without replacing it', async () => {
        const i = await uploaded();
        await expect(createImportUpload(context, i.itemId)).rejects.toMatchObject({status:409,message:'File already uploaded; finalize this import.'});
        const result = await finalizeImport(context, i.itemId);
        expect(result).toMatchObject({version:1,status:'complete'});
        expect(await finalizeImport(context, i.itemId)).toEqual(result);
        expect((await db.query('select extracted_text from material_pages')).rows).toEqual([{extracted_text:'Cash flows'}]);
        expect((await db.query('select id from course_materials')).rows).toHaveLength(1);
    });
    it.each(['returned','thrown'])('does not presign when the object probe has an unexpected %s error', async kind => {
        const i = await reserveSource(context, source); if (i.decision !== 'upload') throw Error('Expected upload');
        const presign = vi.fn().mockResolvedValue({data:{signedUrl:`https://storage.example/storage/v1/object/upload/sign/course-files/${i.storagePath}?token=test`},error:null});
        const bucket = {exists:async()=>{if(kind==='thrown')throw new Error('Storage unavailable');return {data:false,error:{status:503,message:'Storage unavailable'}};},createSignedUploadUrl:presign};
        vi.spyOn(context.client.storage,'from').mockReturnValue(bucket as unknown as ReturnType<typeof context.client.storage.from>);
        await expect(createImportUpload(context,i.itemId)).rejects.toMatchObject({status:503});
        expect(presign).not.toHaveBeenCalled();
    });
    it.each(['size', 'mime', 'signature', 'extension', 'path', 'limit'])('rejects mismatched %s without publishing', async (kind) => { if (kind === 'size')
        source.size = 10; if (kind === 'extension')
        source.name = 'notes.pptx'; const i = await uploaded(kind === 'mime' ? new Blob(['%PDF-xxx'], { type: 'text/html' }) : kind === 'signature' ? new Blob(['bad'], { type: 'application/pdf' }) : kind === 'limit' ? new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: 'application/pdf' }) : undefined); if (kind === 'path')
        await db.query("update drive_import_items set storage_path='outside.pdf' where id=$1", [i.itemId]); await expect(finalizeImport(context, i.itemId)).rejects.toThrow(); expect((await db.query('select id from course_materials')).rows).toHaveLength(0); });
    it('rejects expired leases, foreign connection reads and revocation after upload', async () => { const i = await uploaded(); await expect(createImportUpload({ ...context, connectionId: '99999999-9999-4999-8999-999999999999' }, i.itemId)).rejects.toThrow(); await db.query("update drive_import_items set lease_expires_at=now()-interval '1 second' where id=$1", [i.itemId]); await expect(finalizeImport(context, i.itemId)).rejects.toThrow(); const next = await uploaded(); await context.store.revoke(context.connectionId); await expect(finalizeImport(context, next.itemId)).rejects.toThrow(); });
    it('inventories unsupported files, rejects unsafe source URLs and prevents a second connection claiming an ID', async () => { source.mimeType = 'image/png'; source.name = 'image.png'; expect(await reserveSource(context, source)).toEqual({ decision: 'unsupported' }); source.mimeType = 'application/pdf'; source.name = 'notes.pdf'; source.sourceUrl = 'javascript:alert(1)'; await expect(reserveSource(context, source)).rejects.toThrow(); source.sourceUrl = 'https://drive.google.com/file/d/file/view'; await uploaded(); const c = await context.store.configure(owner, null, [{ driveFolderId: 'other', mode: 'course', courseId: course, rootCourseTitle: 'Finance' }]); const s = await context.store.startScan(c.id); expect(await reserveSource({ ...context, connectionId: c.id, scanId: s.scanId }, { ...source, folderMappingId: s.mappings[0].id })).toEqual({ decision: 'conflict' }); });
    it('parses real PPTX slides and preserves their references', async () => { source.mimeType = 'application/vnd.google-apps.presentation'; source.name = 'Slides'; const deck = new JSZip(); deck.file('ppt/slides/slide3.xml', '<p:sld><a:t>Margin</a:t><p:pic/></p:sld>'); const bytes = await deck.generateAsync({ type: 'uint8array' }); const i = await uploaded(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })); expect((await finalizeImport(context, i.itemId)).status).toBe('needs_visual_review'); expect((await db.query('select page_number,extracted_text from material_pages')).rows).toEqual([{ page_number: 3, extracted_text: 'Margin' }]); });
    it('stops three unchanged parse failures and permits explicit retry or a changed fingerprint', async () => { for (let n = 0; n < 3; n++) {
        const i = await uploaded(new Blob(['%PDF-broken'], { type: 'application/pdf' }));
        await expect(finalizeImport(context, i.itemId)).rejects.toThrow();
    } expect(await reserveSource(context, source)).toMatchObject({ decision: 'unsupported' }); await context.client.rpc('drive_sync_retry_source', { p_connection_id: context.connectionId, p_source_id: (await db.query<{
            id: string;
        }>('select id from drive_sources')).rows[0].id }); const retry = await reserveSource(context, source); expect(retry.decision).toBe('upload'); await context.store.recordError(context.connectionId, 'transient', retry.decision === 'upload' ? retry.itemId : undefined); source.fingerprint = 'v2'; expect((await reserveSource(context, source)).decision).toBe('upload'); });
    it('preserves resource-key source links and rejects unrelated query parameters', async () => { source.sourceUrl += '?resourcekey=valid_key'; expect((await reserveSource(context, source)).decision).toBe('upload'); await expect(reserveSource(context, { ...source, sourceUrl: source.sourceUrl + '&redirect=https://evil.example' })).rejects.toThrow(); });
    it('resolves collection courses on the server and rejects a changed destination mapping', async () => { const connection = await context.store.configure(owner, null, [{ driveFolderId: 'collection', mode: 'collection', rootCourseTitle: 'Classes' }]); const scan = await context.store.startScan(connection.id); const collection = { ...context, connectionId: connection.id, scanId: scan.scanId }; source.folderMappingId = scan.mappings[0].id; source.courseFolderId = 'finance-folder'; source.courseFolderTitle = 'Finance collection'; const item = await reserveSource(collection, source); expect(item.decision).toBe('upload'); const courses = await db.query<{
        title: string;
    }>('select title from courses where id<>$1', [course]); expect(courses.rows).toEqual([{ title: 'Finance collection' }]); expect((await reserveSource(collection, { ...source, courseFolderId: 'different-folder' })).decision).toBe('conflict'); });
    it('retains published availability when root traversal fails without inferring deletion', async () => { const i = await uploaded(); await finalizeImport(context, i.itemId); await context.store.checkpoint(context.connectionId, context.scanId!, { roots: { [source.folderMappingId]: { pendingFolders: [], pendingFiles: [], visitedFolderIds: [], failed: true, completed: false } } }, []); expect((await db.query<{
        available: boolean;
    }>('select available from drive_sources')).rows).toEqual([{ available: true }]); expect((await context.store.startScan(context.connectionId)).scanId).not.toBe(context.scanId); });
    it('refreshes unsupported inventory metadata when source metadata changes', async () => { source.mimeType = 'image/png'; source.name = 'old.png'; await reserveSource(context, source); source.name = 'renamed.png'; source.fingerprint = 'v2'; await reserveSource(context, source); expect((await db.query<{
        name: string;
    }>("select metadata->>'name' as name from drive_sources")).rows).toEqual([{ name: 'renamed.png' }]); });
    it('clears the automatic retry gate when the source fingerprint changes', async () => { for (let n = 0; n < 3; n++) {
        const i = await uploaded(new Blob(['%PDF-broken'], { type: 'application/pdf' }));
        await expect(finalizeImport(context, i.itemId)).rejects.toThrow();
    } expect((await reserveSource(context, source)).decision).toBe('unsupported'); source.fingerprint = 'v2'; expect((await reserveSource(context, source)).decision).toBe('upload'); });
    it('treats empty extracted table cells as no usable content', async () => { source.mimeType = 'application/vnd.google-apps.presentation'; source.name = 'Empty slides'; const deck = new JSZip(); deck.file('ppt/slides/slide1.xml', '<p:sld><a:tbl><a:tr><a:tc><a:t> </a:t></a:tc></a:tr></a:tbl></p:sld>'); const bytes = await deck.generateAsync({ type: 'uint8array' }); const i = await uploaded(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })); expect((await finalizeImport(context, i.itemId)).status).toBe('needs_visual_review'); });
    it('clears prior parse failure metadata after a successful publication', async () => { const broken = await uploaded(new Blob(['%PDF-broken'], { type: 'application/pdf' })); await expect(finalizeImport(context, broken.itemId)).rejects.toThrow(); const good = await uploaded(); await finalizeImport(context, good.itemId); expect((await db.query<{
        parse_failure_count: number;
    }>('select parse_failure_count from drive_sources')).rows).toEqual([{ parse_failure_count: 0 }]); });
    it('counts malformed files while preserving retry for parser infrastructure failures',()=>{
        const corrupt=new Error('Invalid PDF structure.');corrupt.name='InvalidPDFException';
        expect(isPermanentParseFailure(corrupt,'pdf')).toBe(true);
        expect(isPermanentParseFailure(new Error("Can't find end of central directory"),'pptx')).toBe(true);
        expect(isPermanentParseFailure(new Error('Worker initialization failed'),'pdf')).toBe(false);
        expect(isPermanentParseFailure(new Error('Worker initialization failed'),'pptx')).toBe(false);
    });

    it('counts all non-transient failures for the same source fingerprint',async()=>{
        for(const blob of [new Blob(['%PDF-broken'],{type:'application/pdf'}),new Blob(['bad signature'],{type:'application/pdf'}),new Blob(['%PDF-broken'],{type:'text/plain'})]) {const item=await uploaded(blob);await expect(finalizeImport(context,item.itemId)).rejects.toThrow();}
        expect((await reserveSource(context,source)).decision).toBe('unsupported');
    });

    it('atomically expires terminal item failures before completing their root',async()=>{
        const item=await uploaded();const checkpoint={roots:{[source.folderMappingId]:{pendingFolders:[],pendingFiles:[],visitedFolderIds:[],failed:false,completed:true}}};
        const result=await context.client.rpc('drive_sync_checkpoint_with_errors',{p_connection_id:context.connectionId,p_scan_id:context.scanId,p_value:checkpoint,p_completed_root_ids:[source.folderMappingId],p_errors:[{itemId:item.itemId,driveFileId:source.driveFileId,message:'Source permission was lost.'}]});
        expect(result.error).toBeNull();
        expect((await db.query<{status:string}>('select status from drive_import_items where id=$1',[item.itemId])).rows).toEqual([{status:'expired'}]);
        expect((await db.query<{status:string;checkpoint:unknown}>('select status,checkpoint from drive_scans where id=$1',[context.scanId])).rows).toEqual([{status:'complete',checkpoint}]);
    });
    it('rolls back item expiry and traversal progress together if checkpoint commit is interrupted',async()=>{
        const item=await uploaded();const before=(await db.query<{checkpoint:unknown}>('select checkpoint from drive_scans where id=$1',[context.scanId])).rows[0].checkpoint;
        await db.exec("reset role; create function public.interrupt_checkpoint() returns trigger language plpgsql as $$ begin raise exception 'simulated checkpoint interruption'; end $$; create trigger interrupt_checkpoint before update on public.drive_scans for each row execute function public.interrupt_checkpoint(); set role service_role;");
        const result=await context.client.rpc('drive_sync_checkpoint_with_errors',{p_connection_id:context.connectionId,p_scan_id:context.scanId,p_value:{roots:{[source.folderMappingId]:{pendingFolders:[],pendingFiles:[],visitedFolderIds:[],failed:false,completed:true}}},p_completed_root_ids:[source.folderMappingId],p_errors:[{itemId:item.itemId,message:'terminal failure'}]});
        expect(result.error?.message).toContain('simulated checkpoint interruption');
        expect((await db.query<{status:string;last_error:string|null}>('select status,last_error from drive_import_items where id=$1',[item.itemId])).rows).toEqual([{status:'leased',last_error:null}]);
        expect((await db.query<{checkpoint:unknown}>('select checkpoint from drive_scans where id=$1',[context.scanId])).rows[0].checkpoint).toEqual(before);
    });
    it('rejects oversized progress and foreign-scan item errors without expiring leases',async()=>{
        const item=await uploaded();const args={p_connection_id:context.connectionId,p_scan_id:context.scanId,p_value:{roots:{}},p_completed_root_ids:[],p_errors:[{itemId:item.itemId,message:'terminal'}]};
        const oversized=await context.client.rpc('drive_sync_checkpoint_with_errors',{...args,p_value:{roots:{},padding:'x'.repeat(270000)}});expect(oversized.error?.message).toContain('Checkpoint capacity');
        expect((await db.query<{status:string}>('select status from drive_import_items where id=$1',[item.itemId])).rows).toEqual([{status:'leased'}]);
        await db.query("update drive_import_items set status='expired' where id=$1",[item.itemId]);
        await context.store.checkpoint(context.connectionId,context.scanId!,{roots:{[source.folderMappingId]:{pendingFolders:[],pendingFiles:[],visitedFolderIds:[],failed:true,completed:false}}},[]);
        const next=await context.store.startScan(context.connectionId);const foreign=await context.client.rpc('drive_sync_checkpoint_with_errors',{...args,p_scan_id:next.scanId});expect(foreign.error?.message).toContain('scan');
        expect((await db.query<{last_error:string|null}>('select last_error from drive_import_items where id=$1',[item.itemId])).rows).toEqual([{last_error:null}]);
    });

    it('records real worker-wrapped PDF FormatError failures while preserving unknown infrastructure retries',async()=>{
        const malformed=await PDFDocument.create();malformed.addPage();malformed.catalog.Pages().set(PDFName.of('Kids'),PDFName.of('CorruptKids'));
        const bytes=new Uint8Array(await malformed.save({addDefaultPage:false}));
        const reason=await extractPdfPages(bytes.slice()).then(()=>null,(error:unknown)=>error);
        expect(reason).toMatchObject({name:'UnknownErrorException',details:expect.stringMatching(/^FormatError:/)});
        const item=await uploaded(new Blob([bytes],{type:'application/pdf'}));
        await expect(finalizeImport(context,item.itemId)).rejects.toMatchObject({status:422});
        expect((await db.query<{parse_failure_count:number}>('select parse_failure_count from drive_sources')).rows).toEqual([{parse_failure_count:1}]);
        for(const details of [undefined,'Error: worker initialization failed','NetworkError: unavailable','Error: FormatError initializing worker']) {
            const infrastructure=Object.assign(new Error('Worker failed'),{name:'UnknownErrorException',details});
            expect(isPermanentParseFailure(infrastructure,'pdf')).toBe(false);
        }
    });

    it('filters imported history in the database while preserving manual material and historical lookups',async()=>{
        const item=await uploaded(),published=await finalizeImport(context,item.itemId);
        const src=(await db.query<{id:string}>('select id from drive_sources')).rows[0].id;
        await db.query("insert into course_materials(user_id,course_id,name,storage_path,mime_type,file_size,version,drive_source_id,drive_source_version) select $1,$2,'Historical','history-'||n,'application/pdf',10,n,$3,n from generate_series(2,1002) n",[owner,course,src]);
        const manual=(await db.query<{id:string}>("insert into course_materials(user_id,course_id,name,storage_path,mime_type,file_size) values($1,$2,'Manual','manual','application/pdf',10) returning id",[owner,course])).rows[0].id;
        const visible=await db.query<{id:string}>('select id from current_course_materials order by name');
        expect(visible.rows).toEqual([{id:manual},{id:published.materialId}]);
        expect((await db.query('select id from course_materials where drive_source_version=1002')).rows).toHaveLength(1);
        await db.query('update drive_sources set available=false where id=$1',[src]);expect((await db.query<{id:string}>('select id from current_course_materials')).rows).toEqual([{id:manual}]);
        expect((await db.query("select has_table_privilege('authenticated','public.current_course_materials','select') as can_read,has_table_privilege('authenticated','public.current_course_materials','update') as can_write,has_table_privilege('anon','public.current_course_materials','select') as anon_read")).rows).toEqual([{can_read:true,can_write:false,anon_read:false}]);
        await db.exec("reset role; set role authenticated; select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false)");
        expect((await db.query('select id from current_course_materials')).rows).toEqual([]);
    });

});
