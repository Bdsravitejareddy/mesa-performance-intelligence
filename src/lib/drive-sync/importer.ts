import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractPdfPages, extractPptxSlides, type ExtractedPage } from "@/lib/documents";
import type { SourceFile, ImportDecision } from "./contracts";
import type { DriveSyncStore } from "./store";
import { safeDriveSourceUrl } from "./source-url";
import { HttpError } from "./http";
export type ImportContext = {
    connectionId: string;
    userId: string;
    scanId?: string;
    client: SupabaseClient;
    store: DriveSyncStore;
};
const maxSize = 20 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireId(value: unknown): string { if (typeof value !== 'string' || !uuid.test(value))
    throw new HttpError(400, 'A valid record ID is required.'); return value; }
export function validateSource(value: unknown): SourceFile {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Invalid source metadata.');
    const s = value as SourceFile;
    for (const key of ['driveFileId', 'name', 'mimeType', 'parentId', 'sourceUrl', 'fingerprint', 'folderMappingId', 'courseFolderId', 'courseFolderTitle'] as const)
        if (typeof s[key] !== 'string' || !s[key].trim() || s[key].length > 2000)
            throw new HttpError(400, 'Invalid source metadata.');
    requireId(s.folderMappingId);
    if (!safeDriveSourceUrl(s.driveFileId, s.sourceUrl))
        throw new HttpError(400, 'A canonical Google Drive source URL is required.');
    if (s.size !== undefined && (!Number.isSafeInteger(s.size) || s.size < 0))
        throw new HttpError(400, 'Invalid source size.');
    if (s.targetId !== undefined && (typeof s.targetId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(s.targetId)))
        throw new HttpError(400, 'Invalid shortcut target.');
    return { driveFileId: s.driveFileId, name: s.name, mimeType: s.mimeType, parentId: s.parentId, sourceUrl: s.sourceUrl, fingerprint: s.fingerprint, folderMappingId: s.folderMappingId, courseFolderId: s.courseFolderId, courseFolderTitle: s.courseFolderTitle, ...(s.size === undefined ? {} : { size: s.size }), ...(s.targetId ? { targetId: s.targetId } : {}) };
}
export async function reserveSource(context: ImportContext, source: SourceFile): Promise<ImportDecision> {
    requireId(context.scanId);
    return context.store.reserve(context.connectionId, context.scanId!, validateSource(source));
}
type Item = {
    id: string;
    source_id: string;
    scan_id: string;
    mapping_revision: number;
    source_snapshot: SourceFile;
    storage_path: string;
    status: string;
    lease_expires_at: string;
    material_id: string | null;
    version: number | null;
};
type Source = {
    id: string;
    course_id: string;
    course_user_id: string;
    export_format: 'pdf' | 'pptx';
    folder_mapping_id: string;
};
async function itemContext(c: ImportContext, id: string): Promise<{
    item: Item;
    source: Source;
}> {
    requireId(id);
    const { data: connection, error: ce } = await c.client.from('drive_connections').select('id, enabled, mapping_revision').eq('id', c.connectionId).eq('user_id', c.userId).maybeSingle();
    if (ce || !connection || !connection.enabled)
        throw new HttpError(403, 'Connection unavailable.');
    const { data: item, error: ie } = await c.client.from('drive_import_items').select('id, source_id, scan_id, mapping_revision, source_snapshot, storage_path, status, lease_expires_at, material_id, version').eq('connection_id', c.connectionId).eq('id', id).maybeSingle();
    if (ie || !item)
        throw new HttpError(404, 'Import item unavailable.');
    if (item.mapping_revision !== connection.mapping_revision)
        throw new HttpError(409, 'Import configuration changed.');
    const { data: source, error: se } = await c.client.from('drive_sources').select('id, course_id, course_user_id, export_format, folder_mapping_id').eq('connection_id', c.connectionId).eq('id', item.source_id).maybeSingle();
    if (se || !source)
        throw new HttpError(404, 'Source unavailable.');
    if (item.storage_path !== `${source.course_user_id}/${source.course_id}/drive/${item.id}.${source.export_format}`)
        throw new HttpError(403, 'Invalid private object path.');
    if (item.status !== 'published') {
        if (item.status !== 'leased' || Date.parse(item.lease_expires_at) <= Date.now())
            throw new HttpError(409, 'Import lease expired.');
        const { data: scan, error } = await c.client.from('drive_scans').select('id, status, mapping_revision').eq('connection_id', c.connectionId).eq('id', item.scan_id).maybeSingle();
        if (error || !scan || scan.status !== 'running' || scan.mapping_revision !== connection.mapping_revision)
            throw new HttpError(409, 'Import scan expired.');
    }
    return { item: item as Item, source: source as Source };
}
export async function createImportUpload(c: ImportContext, id: string): Promise<{
    signedUrl: string;
    storageOrigin: string;
}> {
    const { item } = await itemContext(c, id);
    if (item.status === 'published')
        throw new HttpError(409, 'Import already published.');
    const expected = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (expected.protocol !== 'https:' || expected.username || expected.password)
        throw new HttpError(503, 'Private storage configuration is unavailable.');
    const bucket = c.client.storage.from('course-files');
    let exists: Awaited<ReturnType<typeof bucket.exists>>;
    try { exists = await bucket.exists(item.storage_path); }
    catch { throw new HttpError(503, 'Could not check the private upload.'); }
    if (exists.error && !(exists.data === false && 'status' in exists.error && (exists.error.status === 400 || exists.error.status === 404)))
        throw new HttpError(503, 'Could not check the private upload.');
    if (exists.data)
        throw new HttpError(409, 'File already uploaded; finalize this import.');
    const { data, error } = await bucket.createSignedUploadUrl(item.storage_path, { upsert: false });
    if (error || !data)
        throw new HttpError(503, 'Could not reserve a private upload.');
    const signed = new URL(data.signedUrl);
    if (signed.origin !== expected.origin || signed.protocol !== 'https:' || signed.username || signed.password)
        throw new HttpError(503, 'Unexpected private storage origin.');
    return { signedUrl: data.signedUrl, storageOrigin: expected.origin };
}
async function published(c: ImportContext, materialId: string, version: number, sourceId: string) {
    const { data, error } = await c.client.from('course_materials').select('id, extraction_status').eq('id', materialId).eq('drive_source_id', sourceId).maybeSingle();
    if (error || !data)
        throw new HttpError(503, 'Published material is unavailable.');
    return { materialId, version, status: data.extraction_status as string };
}
async function failure(c: ImportContext, id: string, code: string) { const { error } = await c.client.rpc('drive_sync_parse_failure', { p_connection_id: c.connectionId, p_item_id: id, p_code: code }); if (error)
    throw new HttpError(503, 'Could not record import failure.'); }
export function isPermanentParseFailure(error:unknown,format:'pdf'|'pptx'):boolean {
 if(!(error instanceof Error))return false;
 return format==='pdf'
  ? ['InvalidPDFException','PasswordException','FormatError'].includes(error.name) || (error.name==='UnknownErrorException' && 'details' in error && typeof error.details==='string' && /^FormatError:/.test(error.details))
  : /zip|central directory|readable slides|invalid|malformed|unclosed|unexpected|corrupt|end of data|encrypted|unsupported compression/i.test(error.message);
}
export async function finalizeImport(c: ImportContext, id: string): Promise<{
    materialId: string;
    version: number;
    status: string;
}> {
    const { item, source } = await itemContext(c, id);
    if (item.status === 'published') {
        // Revalidate revocation, membership and mapping with the transactional publication boundary.
        const result = await c.store.publish(c.connectionId, id, [], 0);
        return published(c, result.materialId, result.version, source.id);
    }
    const { data: file, error } = await c.client.storage.from('course-files').download(item.storage_path);
    if (error || !file)
        throw new HttpError(503, 'Uploaded file is not available yet.');
    const s = item.source_snapshot, mime = source.export_format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const native = s.mimeType.startsWith('application/vnd.google-apps.');
    if (file.size < 1 || file.size > maxSize || (!native && s.size !== undefined && s.size !== file.size) || file.type.split(';')[0] !== mime || (!native && s.name.split('.').at(-1)?.toLowerCase() !== source.export_format)) {
        await failure(c, id, 'invalid_metadata');
        throw new HttpError(file.size > maxSize ? 413 : 415, 'Stored file size or type does not match the source.');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size || (source.export_format === 'pdf' ? new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-' : !(bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4))) {
        await failure(c, id, 'invalid_signature');
        throw new HttpError(415, 'Stored file signature does not match its format.');
    }
    const objectSize = bytes.byteLength;
    let pages: ExtractedPage[];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const extraction = source.export_format === 'pdf' ? extractPdfPages(bytes) : (async () => (await extractPptxSlides(bytes)).map(s => ({ pageNumber: s.slideNumber, text: s.text, tables: s.tables, hasVisuals: s.hasVisuals })))();
        pages = await Promise.race([extraction, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HttpError(503, 'Parsing timed out; retry this import.')), 45000); })]);
    }
    catch (error) {
        if (error instanceof HttpError)
            throw error;
        if (!isPermanentParseFailure(error, source.export_format)) throw new HttpError(503, 'Document parsing is temporarily unavailable; retry this import.');
        await failure(c, id, source.export_format === 'pdf' ? 'parse_pdf' : 'parse_pptx');
        throw new HttpError(422, 'Document could not be parsed. Review the source or retry from the dashboard.');
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    const result = await c.store.publish(c.connectionId, id, pages, objectSize);
    return published(c, result.materialId, result.version, source.id);
}
