import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { retrieveRelevantReferences } from './retrieval';
describe('current imported course retrieval', () => {
    it('retrieves manual and available current imported versions while preserving historical records', async () => {
        const materials = [{ id: 'manual', name: 'Manual', version: 1, source_kind: 'lecture', drive_source_id: null }, { id: 'old', name: 'Drive', version: 1, source_kind: 'lecture', drive_source_id: 'source' }, { id: 'new', name: 'Drive', version: 2, source_kind: 'lecture', drive_source_id: 'source' }, { id: 'missing', name: 'Unavailable', version: 1, source_kind: 'lecture', drive_source_id: 'missing-source' }];
        const client = createClient('https://storage.example', 'public-key', { global: { fetch: async (input) => { const url = new URL(String(input)); let data: unknown[] = []; if (url.pathname.endsWith('/course_materials'))
                    data = materials;
                else if (url.pathname.endsWith('/drive_sources'))
                    data = [{ id: 'source', current_material_id: 'new', available: true }, { id: 'missing-source', current_material_id: 'missing', available: false }];
                else if (url.pathname.endsWith('/material_pages'))
                    data = materials.filter(m => url.searchParams.get('material_id')?.slice(4, -1).split(",").includes(m.id)).map(m => ({ id: `page-${m.id}`, material_id: m.id, page_number: 1, extracted_text: 'Cash flows', table_data: [], has_visuals: false, visual_notes: '' })); return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }); } } });
        const results = await retrieveRelevantReferences(client, 'course', 'assessment', 'Cash flows');
        expect(results.map(r => r.materialId)).toEqual(['manual', 'new']);
        expect(results[1].label).toBe('Drive v2, page/slide 1');
        expect(materials).toHaveLength(4);
    });
});
