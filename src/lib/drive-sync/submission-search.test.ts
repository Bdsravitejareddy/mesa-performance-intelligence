import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase, course, owner } from './importer-test-db';
import type { DriveConnection, SourceFile } from './contracts';
import { searchTerms } from './submission-search';

let db: PGlite;
async function rpc<T = unknown>(name: string, ...args: unknown[]): Promise<T> {
  const parameters = args.map(value => value && typeof value === 'object' ? JSON.stringify(value) : value);
  return (await db.query<{ value: T }>(`select public.drive_sync_${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, parameters)).rows[0].value;
}
const folder = { driveFolderId: 'root_folder_123', mode: 'course', courseId: course, rootCourseTitle: 'Finance' };
function hit(connection: DriveConnection, id: string, courseFolderId: string, mimeType = 'application/vnd.google-apps.spreadsheet'): SourceFile {
  const m = connection.mappings.find(mapping => mapping.mode === 'submissions')!;
  return { driveFileId: id, name: `Copy of Session 1 Rapido Workbook`, mimeType, parentId: 'search:abc', sourceUrl: `https://drive.google.com/file/d/${id}/view`, fingerprint: 'v1', folderMappingId: m.id, courseFolderId, courseFolderTitle: 'Finance' };
}
beforeEach(async () => { db = await createTestDatabase({ submissionSearch: true }); });
afterEach(async () => { await db.close(); });

describe('submitted-work search root', () => {
  it('takes the distinctive words a submitted copy keeps from the assignment title', () => {
    expect(searchTerms('Session 1 Rapido Workbook')).toEqual(['Session', '1', 'Rapido', 'Workbook']);
    expect(searchTerms('Crafting Marketing Strategies - End Term Assignment')).toEqual(['Crafting', 'Marketing', 'Strategies', 'End']);
    expect(searchTerms('Important: Business Reader - Assessment 1')).toEqual(['Business', 'Reader', 'Assessment', '1']);
  });

  it('is added to every connection, survives folder edits and cannot be supplied as a folder', async () => {
    const created = await rpc<DriveConnection>('configure', owner, null, [folder]);
    expect(created.mappings.map(m => m.mode).sort()).toEqual(['course', 'submissions']);
    const edited = await rpc<DriveConnection>('configure', owner, created.id, [{ ...folder, driveFolderId: 'second_folder_123' }]);
    expect(edited.mappings.filter(m => m.mode === 'submissions')).toHaveLength(1);
    await expect(rpc('configure', owner, created.id, [{ driveFolderId: 'search:submissions', mode: 'submissions', rootCourseTitle: 'x' }])).rejects.toThrow(/Invalid mapping mode/);
  });

  it('files a Google Sheets hit under the matched LMS course as an .xlsx export, and rejects unknown courses', async () => {
    const connection = await rpc<DriveConnection>('configure', owner, null, [folder]);
    const scan = await rpc<{ scanId: string }>('start_scan', connection.id);
    const decision = await rpc<{ decision: string; storagePath: string; exportFormat: string }>('reserve', connection.id, scan.scanId, hit(connection, 'sheet_copy_1', course));
    expect(decision).toMatchObject({ decision: 'upload', exportFormat: 'xlsx' });
    expect(decision.storagePath.startsWith(`${owner}/${course}/drive/`)).toBe(true);
    await expect(rpc('reserve', connection.id, scan.scanId, hit(connection, 'sheet_copy_2', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))).rejects.toThrow(/Invalid course/);
  });
});
