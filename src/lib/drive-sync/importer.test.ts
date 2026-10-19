import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
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
        storage: { from: () => ({ createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://storage.example/storage/v1/object/upload/sign/course-files/${path}?token=test` }, error: null }), download: async (path: string) => ({ data: objects.get(path) ?? null, error: null }) }) },
    } as unknown as SupabaseClient;
}
async function pdf(empty = false) { const p = await PDFDocument.create(); const page = p.addPage(); if (!empty)
    page.drawText('Cash flows', { font: await p.embedFont(StandardFonts.Helvetica) }); return new Blob([new Uint8Array(await p.save())], { type: 'application/pdf' }); }
async function uploaded(file?: Blob) { const decision = await reserveSource(context, source); if (decision.decision !== 'upload')
    throw Error('Expected upload'); objects.set(decision.storagePath, file ?? await pdf()); return decision; }
beforeEach(async () => { db = await createTestDatabase(); objects.clear(); process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://storage.example'; const c = client(), store = new DriveSyncStore(c); const connection = await store.configure(owner, null, [{ driveFolderId: 'root', mode: 'course', courseId: course, rootCourseTitle: 'Finance' }]); const scan = await store.startScan(connection.id); context = { connectionId: connection.id, userId: owner, scanId: scan.scanId, client: c, store }; source = { driveFileId: 'file', name: 'notes.pdf', mimeType: 'application/pdf', parentId: 'root', sourceUrl: 'https://drive.google.com/file/d/file/view', fingerprint: 'v1', folderMappingId: scan.mappings[0].id, courseFolderId: 'root', courseFolderTitle: 'Finance' }; });
afterEach(async () => { await db.close(); });
describe('Drive importer', () => {
    it('publishes real parsed PDF pages atomically, resumes finalize and skips unchanged files', async () => { const item = await uploaded(); const result = await finalizeImport(context, item.itemId); expect(result).toMatchObject({ version: 1, status: 'complete' }); objects.clear(); expect(await finalizeImport(context, item.itemId)).toEqual(result); expect(await reserveSource(context, source)).toEqual({ decision: 'unchanged' }); const rows = await db.query<{
        extracted_text: string;
    }>('select extracted_text from material_pages'); expect(rows.rows[0].extracted_text).toBe('Cash flows'); source.fingerprint = 'v2'; const next = await uploaded(); expect((await finalizeImport(context, next.itemId)).version).toBe(2); expect((await db.query('select id from course_materials')).rows).toHaveLength(2); });
    it('marks a text-empty PDF needs_visual_review including idempotent retries', async () => { const i = await uploaded(await pdf(true)); const result = await finalizeImport(context, i.itemId); expect(result.status).toBe('needs_visual_review'); expect((await finalizeImport(context, i.itemId)).status).toBe('needs_visual_review'); });
    it('issues a direct private signed URL and accepts 5 MB bytes without a JSON upload body', async () => { const base = new Uint8Array(await (await pdf()).arrayBuffer()); const large = new Uint8Array(5 * 1024 * 1024); large.set(base); const i = await uploaded(new Blob([large], { type: 'application/pdf' })); expect(await createImportUpload(context, i.itemId)).toEqual({ signedUrl: `https://storage.example/storage/v1/object/upload/sign/course-files/${i.storagePath}?token=test`, storageOrigin: 'https://storage.example' }); expect((await finalizeImport(context, i.itemId)).status).toBe('complete'); });
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

});
