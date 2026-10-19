import { beforeEach, describe, it, expect, vi } from 'vitest';
import { HttpError } from '@/lib/drive-sync/http';
const f = vi.hoisted(() => ({ member: vi.fn(), session: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/drive-sync/auth', () => ({ requireWorkspaceMember: f.member }));
vi.mock('@/lib/supabase/server', () => ({ createClient: f.session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: f.admin }));
import { POST } from './route';
const id = '11111111-1111-4111-8111-111111111111';
const request = () => new Request('https://dashboard.example/api/drive-sync/sources/id/retry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
beforeEach(() => { vi.resetAllMocks(); f.member.mockResolvedValue({ userId: id }); });
describe('explicit source retry', () => {
    it('rejects outsiders and sources hidden by session RLS', async () => { f.member.mockRejectedValueOnce(new HttpError(403, 'Membership required.')); expect((await POST(request(), { params: Promise.resolve({ id }) })).status).toBe(403); const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; f.session.mockResolvedValue({ from: () => q }); expect((await POST(request(), { params: Promise.resolve({ id }) })).status).toBe(404); });
    it('resets only the source and connection resolved through session RLS', async () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id, connection_id: 'connection' }, error: null }) }; f.session.mockResolvedValue({ from: () => q }); f.admin.mockReturnValue({ rpc: async (_name: string, args: unknown) => { expect(args).toEqual({ p_connection_id: 'connection', p_source_id: id }); return { error: null }; } }); const response = await POST(request(), { params: Promise.resolve({ id }) }); expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true }); });
});
