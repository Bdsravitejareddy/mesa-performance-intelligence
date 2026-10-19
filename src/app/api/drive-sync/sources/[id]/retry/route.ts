import { requireWorkspaceMember } from '@/lib/drive-sync/auth';
import { HttpError, readJsonBody, jsonResponse, jsonError } from '@/lib/drive-sync/http';
import { requireId } from '@/lib/drive-sync/importer';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
export async function POST(request: Request, context: {
    params: Promise<{
        id: string;
    }>;
}): Promise<Response> {
    try {
        await requireWorkspaceMember();
        const body = await readJsonBody(request);
        if (Object.keys(body).length)
            throw new HttpError(400, 'An empty JSON object is required.');
        const id = requireId((await context.params).id), session = await createClient();
        const { data: source, error } = await session.from('drive_sources').select('id, connection_id').eq('id', id).maybeSingle();
        if (error || !source)
            throw new HttpError(404, 'Source unavailable.');
        const result = await createAdminClient().rpc('drive_sync_retry_source', { p_connection_id: source.connection_id, p_source_id: source.id });
        if (result.error)
            throw new HttpError(503, 'Could not reset this source.');
        return jsonResponse({ ok: true });
    }
    catch (error) {
        return jsonError(error);
    }
}
