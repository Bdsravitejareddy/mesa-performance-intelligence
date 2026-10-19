import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaterialProvenance } from './material-provenance';
describe('course material provenance', () => {
    it('escapes filenames and preserves original Drive source, version and extraction status', () => { const output = renderToStaticMarkup(createElement(MaterialProvenance, { name: '<script>alert(1)</script>', version: 2, sourceKind: 'lecture_notes', extractionStatus: 'needs_visual_review', driveFileId: 'file', sourceUrl: 'https://drive.google.com/file/d/file/view?resourcekey=key_1', current: true })); expect(output).toContain('&lt;script&gt;'); expect(output).not.toContain('<script>'); expect(output).toContain('v2'); expect(output).toContain('needs visual review'); expect(output).toContain('https://drive.google.com/file/d/file/view?resourcekey=key_1'); });
    it('omits arbitrary metadata links and labels historical versions', () => { const output = renderToStaticMarkup(createElement(MaterialProvenance, { name: 'Old', version: 1, sourceKind: 'lecture_notes', extractionStatus: 'complete', driveFileId: 'file', sourceUrl: 'javascript:alert(1)', current: false })); expect(output).not.toContain('href='); expect(output).toContain('Historical version'); });
    it('distinguishes source availability from extraction success',()=>{const output=renderToStaticMarkup(createElement(MaterialProvenance,{name:'Notes',version:2,sourceKind:'lecture_notes',extractionStatus:'complete',current:true,available:false}));expect(output).toContain('complete');expect(output).toContain('Source unavailable');});

});
