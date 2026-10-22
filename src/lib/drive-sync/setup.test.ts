import { describe, it, expect } from 'vitest';
import { createTestDatabase, owner } from './importer-test-db';
import { DriveSyncStore } from './store';

describe('Drive setup metadata', () => {
  it('round trips root resource keys without returning persisted connector secrets', async () => {
    const db = await createTestDatabase();
    try {
      const result = await db.query<{value: {id:string;mappings:Array<{resourceKey:string}>}}>(`select public.drive_sync_configure($1,null,$2::jsonb,'Personal',true) value`, [owner, JSON.stringify([{driveFolderId:'root_folder_123',resourceKey:'0-resource_KEY',mode:'course',rootCourseTitle:'Finance'}])]);
      const c = result.rows[0].value;
      expect(c.mappings[0].resourceKey).toBe('0-resource_KEY');
      const scan = await db.query<{value:{mappings:Array<{resourceKey:string}>}}>(`select public.drive_sync_start_scan($1) value`,[c.id]);
      expect(scan.rows[0].value.mappings[0].resourceKey).toBe('0-resource_KEY');
      await db.query(`select public.drive_sync_issue_pairing($1,$2,now()+interval '14 minutes')`,[c.id,'a'.repeat(64)]);
      const status = await db.query<{value:unknown}>(`select public.drive_sync_status($1::uuid[]) value`,[[c.id]]);
      expect(JSON.stringify(status.rows[0].value)).not.toMatch(/hash|aaaaaaaa/);
      expect(status.rows[0].value).toMatchObject([{id:c.id,paired:false}]);
      await db.query(`select public.drive_sync_consume_pairing($1,$2)`,['a'.repeat(64),'b'.repeat(64)]);
      const paired = await db.query<{value:unknown}>(`select public.drive_sync_status($1::uuid[]) value`,[[c.id]]);
      expect(paired.rows[0].value).toMatchObject([{id:c.id,paired:true}]);
      await db.exec('reset role; set role authenticated');
      await expect(db.query(`select public.drive_sync_status($1::uuid[])`,[[c.id]])).rejects.toThrow(/permission denied/);
    } finally { await db.close(); }
  });
  it('enforces root resource key validation at the database boundary', async () => {
    const db = await createTestDatabase();
    try {
      await expect(db.query(`select public.drive_sync_configure($1,null,$2::jsonb,'Personal',true)`,[owner,JSON.stringify([{driveFolderId:'root_folder_123',resourceKey:'bad/key',mode:'course',rootCourseTitle:'Finance'}])])).rejects.toThrow();
    } finally { await db.close(); }
  });
  it('reports inventory exceptions separately from completed scans and never mutates scan state',async()=>{
    const db=await createTestDatabase();
    try {
      const configured=await db.query<{value:{id:string;mappings:Array<{id:string}>}}>(`select public.drive_sync_configure($1,null,$2::jsonb,'Personal',true) value`,[owner,JSON.stringify([{driveFolderId:'root_folder_123',mode:'course',rootCourseTitle:'Finance'}])]);
      const c=configured.rows[0].value;
      const started=await db.query<{value:{scanId:string}}>(`select public.drive_sync_start_scan($1) value`,[c.id]);
      const scanId=started.rows[0].value.scanId;
      for(const [id,mime] of [['unsupported_file','image/png'],['failed_file','application/pdf']]) {
        await db.query(`select public.drive_sync_reserve($1,$2,$3::jsonb)`,[c.id,scanId,JSON.stringify({driveFileId:id,name:id,mimeType:mime,parentId:'root_folder_123',sourceUrl:`https://drive.google.com/file/d/${id}/view`,fingerprint:'v1',folderMappingId:c.mappings[0].id,courseFolderId:'root_folder_123',courseFolderTitle:'Finance'})]);
      }
      await db.exec(`update public.drive_sources set parse_failure_count=3,parse_failure_code='parse_pdf' where drive_file_id='failed_file'`);
      const before=await db.query('select * from public.drive_scans');
      const status=await db.query<{value:unknown}>(`select public.drive_sync_status($1::uuid[]) value`,[[c.id]]);
      expect(status.rows[0].value).toMatchObject([{counts:{total:2,indexed:0,unsupported:1,failed:1,unavailable:0},latestScan:{status:'running'},lastSuccessfulScanAt:null,sources:expect.arrayContaining([expect.objectContaining({driveFileId:'failed_file',failureCount:3})])}]);
      expect(await db.query('select * from public.drive_scans')).toEqual(before);
    } finally {await db.close();}
  });
  it('exposes status through an explicit read-only store method', async () => {
    const calls: string[]=[];
    const store = new DriveSyncStore({rpc:async(name: string)=>{calls.push(name);return {data:[],error:null};}} as never);
    await store.status(['11111111-1111-4111-8111-111111111111']);
    expect(calls).toEqual(['drive_sync_status']);
  });
});
