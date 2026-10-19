import { requireConnector } from '@/lib/drive-sync/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { DriveSyncStore } from '@/lib/drive-sync/store';
import { HttpError, jsonError, jsonResponse, readJsonBody } from '@/lib/drive-sync/http';
import { createImportUpload, finalizeImport, requireId, reserveSource, validateSource, type ImportContext } from '@/lib/drive-sync/importer';
import type { ScanCheckpoint } from '@/lib/drive-sync/contracts';
type Operation = 'session' | 'inventory' | 'upload' | 'finalize' | 'checkpoint';
function exact(body: Record<string, unknown>, keys: string[]) { if (Object.keys(body).some(k => !keys.includes(k)))
    throw new HttpError(400, 'Unexpected request field.'); }
function validCheckpoint(value: unknown): ScanCheckpoint {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new HttpError(400, 'Invalid checkpoint.');
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 256 * 1024)
        throw new HttpError(413, "Checkpoint capacity exceeded (256 KiB); previous progress was preserved.");
    const roots = (value as ScanCheckpoint).roots;
    if (!roots || typeof roots !== 'object' || Array.isArray(roots) || Object.keys(roots).length > 100)
        throw new HttpError(400, 'Invalid checkpoint roots.');
    for (const [id, root] of Object.entries(roots)) {
        requireId(id);
        if (!root || typeof root !== 'object' || typeof root.failed !== 'boolean' || typeof root.completed !== 'boolean' || !Array.isArray(root.pendingFolders) || !Array.isArray(root.visitedFolderIds) || root.visitedFolderIds.some(id => typeof id !== 'string') || root.pendingFiles !== undefined && !Array.isArray(root.pendingFiles))
            throw new HttpError(400, 'Invalid checkpoint root.');
        for (const folder of root.pendingFolders)
            if (!folder || ['id', 'courseFolderId', 'courseFolderTitle'].some(k => typeof (folder as unknown as Record<string, unknown>)[k] !== 'string'))
                throw new HttpError(400, 'Invalid pending folder.');
        for (const file of root.pendingFiles ?? [])
            validateSource(file);
    }
    return value as ScanCheckpoint;
}
export function machineHandler(operation: Operation) {
    return async function POST(request: Request): Promise<Response> {
        try {
            const identity = await requireConnector(request), body = await readJsonBody(request);
            const keys = { session: [], inventory: ['scanId', 'files'], upload: ['itemId'], finalize: ['itemId'], checkpoint: ['scanId', 'checkpoint', 'completedRootIds', 'errors'] }[operation];
            exact(body, keys);
            if (operation === 'inventory' && (!Array.isArray(body.files) || body.files.length > 100))
                throw new HttpError(400, 'Inventory batches contain at most 100 files.');
            if (operation === 'checkpoint') {
                requireId(body.scanId);
                validCheckpoint(body.checkpoint);
                if (!Array.isArray(body.completedRootIds) || body.completedRootIds.length > 100)
                    throw new HttpError(400, 'Invalid completed roots.');
                body.completedRootIds.forEach(requireId);
                if (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length > 100))
                    throw new HttpError(400, 'Invalid scan errors.');
                for (const error of (body.errors ?? []) as Record<string, unknown>[]) {
                    if (!error || typeof error.message !== 'string' || error.message.length > 1000)
                        throw new HttpError(400, 'Invalid scan error.');
                    if (error.itemId !== undefined)
                        requireId(error.itemId);
                }
            }
            const client = createAdminClient(), store = new DriveSyncStore(client), context: ImportContext = { ...identity, client, store };
            if (operation === 'session')
                return jsonResponse(await store.startScan(identity.connectionId));
            if (operation === 'inventory') {
                context.scanId = requireId(body.scanId);
                const files = (body.files as unknown[]).map(validateSource), decisions = [];
                for (const file of files) {
                    const decision = await reserveSource(context, file);
                    const { decision: action, ...fields } = decision;
                    decisions.push({ driveFileId: file.driveFileId, action, ...('itemId' in fields ? { itemId: fields.itemId } : {}), ...('reason' in fields ? { reason: fields.reason } : {}) });
                }
                return jsonResponse({ decisions });
            }
            if (operation === 'upload')
                return jsonResponse(await createImportUpload(context, requireId(body.itemId)));
            if (operation === 'finalize')
                return jsonResponse(await finalizeImport(context, requireId(body.itemId)));
            // Commit traversal before recording ancillary error messages. Capacity rejection preserves progress.
            await store.checkpoint(identity.connectionId, body.scanId as string, body.checkpoint as ScanCheckpoint, body.completedRootIds as string[]);
            for (const error of (body.errors ?? []) as {
                message: string;
                itemId?: string;
            }[])
                await store.recordError(identity.connectionId, error.message, error.itemId);
            return jsonResponse({ ok: true });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'Checkpoint capacity exceeded (256 KiB)')
                return jsonError(new HttpError(413, 'Checkpoint capacity exceeded (256 KiB); previous progress was preserved.'));
            return jsonError(error);
        }
    };
}
