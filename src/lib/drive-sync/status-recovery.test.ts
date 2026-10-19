import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase, course, owner } from './importer-test-db';
import type { DriveConnection, DriveOperationalStatus, SourceFile } from './contracts';

const member='22222222-2222-4222-8222-222222222222';
const otherCourse='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db:PGlite;
async function rpc<T=unknown>(name:string,...args:unknown[]):Promise<T> {
  const parameters=args.map(value=>value && typeof value==='object'?JSON.stringify(value):value);
  return (await db.query<{value:T}>(`select public.drive_sync_${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,parameters)).rows[0].value;
}
async function configure(shared=false) {
  if(shared)await db.query('insert into public.courses(id,user_id,title) values($1,$2,$3)',[otherCourse,member,'Other course']);
  return rpc<DriveConnection>('configure',owner,null,[{driveFolderId:'root_folder_123',mode:'course',courseId:course,rootCourseTitle:'Finance'},...(shared?[{driveFolderId:'other_folder_123',mode:'course',courseId:otherCourse,rootCourseTitle:'Other course'}]:[])],'Personal',true);
}
async function start(connection:DriveConnection){return rpc<{scanId:string}>('start_scan',connection.id);}
function source(connection:DriveConnection,id:string,fingerprint='v1',mappingIndex=0,mimeType='application/pdf'):SourceFile {
  const m=connection.mappings[mappingIndex];
  return {driveFileId:id,name:`${id}.pdf`,mimeType,parentId:m.driveFolderId,sourceUrl:`https://drive.google.com/file/d/${id}/view`,fingerprint,folderMappingId:m.id,courseFolderId:m.driveFolderId,courseFolderTitle:m.rootCourseTitle};
}
async function reserve(connection:DriveConnection,scanId:string,file:SourceFile){return rpc<{decision:string;itemId:string}>('reserve',connection.id,scanId,file);}
async function publish(connection:DriveConnection,scanId:string,file:SourceFile) {
  const item=await reserve(connection,scanId,file);
  await rpc('publish',connection.id,item.itemId,[{pageNumber:1,text:'Course content',tables:[],hasVisuals:false}],100);
  return item;
}
function checkpoint(connection:DriveConnection,complete=true,failed=false) {
  return {roots:Object.fromEntries(connection.mappings.map(m=>[m.id,{pendingFolders:complete?[]:[{id:m.driveFolderId,courseFolderId:m.driveFolderId,courseFolderTitle:m.rootCourseTitle}],visitedFolderIds:[],completed:complete&&!failed,failed,pendingFiles:[]}]))};
}
async function finish(connection:DriveConnection,scanId:string){await rpc('checkpoint_with_errors',connection.id,scanId,checkpoint(connection),connection.mappings.map(m=>m.id),[]);}
async function status(connection:DriveConnection){return (await db.query<{value:DriveOperationalStatus[]}>('select public.drive_sync_status($1::uuid[]) value',[[connection.id]])).rows[0].value[0];}
async function lastError(connection:DriveConnection){return (await db.query<{last_error:string|null}>('select last_error from public.drive_connections where id=$1',[connection.id])).rows[0].last_error;}
beforeEach(async()=>{db=await createTestDatabase();});
afterEach(async()=>{await db.close();});

describe('Drive status source isolation and recovery',()=>{
  it.each(['invitation removed','verification removed'])('hides a course owner’s source details and every source count when %s',async(reason)=>{
    const c=await configure(true),first=await start(c);
    for(const [id,index] of [['visible_file',0],['hidden_changed',1],['hidden_unchanged',1]] as const)await publish(c,first.scanId,source(c,id,'v1',index));
    await reserve(c,first.scanId,source(c,'hidden_unsupported','v1',1,'application/vnd.google-apps.spreadsheet'));
    const failed=await reserve(c,first.scanId,source(c,'hidden_failed','v1',1));
    await rpc('parse_failure',c.id,failed.itemId,'parse_pdf');
    await finish(c,first.scanId);
    const second=await start(c);
    await reserve(c,second.scanId,source(c,'visible_file'));
    await reserve(c,second.scanId,source(c,'hidden_unchanged','v1',1));
    await publish(c,second.scanId,source(c,'hidden_changed','v2',1));
    await db.exec("update public.drive_sources set available=false where drive_file_id='hidden_changed'");
    const before=await status(c);
    expect(before).toMatchObject({counts:{total:5,indexed:3,unsupported:1,failed:1,unavailable:1},latestScan:{imported:1,unchanged:2}});
    await db.exec('reset role');
    if(reason==='invitation removed')await db.query('delete from private.workspace_access where email=(select lower(email) from auth.users where id=$1)',[member]);
    else await db.query('update auth.users set email_confirmed_at=null where id=$1',[member]);
    await db.exec('set role service_role');
    const after=await status(c);
    expect(after).toMatchObject({counts:{total:1,indexed:1,unsupported:0,failed:0,unavailable:0},latestScan:{imported:0,unchanged:1}});
    expect(after.sources.map(s=>s.driveFileId)).toEqual(['visible_file']);
    expect(JSON.stringify(after)).not.toContain('hidden_');
  });

  it('clears a stale connection error only after a later completely clean scan',async()=>{
    const c=await configure();
    await rpc('record_error',c.id,'Prior scan error',null);
    const run=await start(c);
    await rpc('checkpoint_with_errors',c.id,run.scanId,checkpoint(c,false),[],[]);
    expect(await lastError(c)).toBe('Prior scan error');
    await finish(c,run.scanId);
    expect(await lastError(c)).toBeNull();
    expect((await status(c)).latestScan?.status).toBe('complete');
  });

  it('retains errors reported on earlier checkpoints of a scan that later finishes',async()=>{
    const c=await configure(),run=await start(c);
    await rpc('checkpoint_with_errors',c.id,run.scanId,checkpoint(c,false),[],[{message:'File unavailable'}]);
    await finish(c,run.scanId);
    expect(await lastError(c)).toBe('File unavailable');
    const next=await start(c);await finish(c,next.scanId);
    expect(await lastError(c)).toBeNull();
  });

  it('retains root errors on failed scans and source errors on completed inventories',async()=>{
    const c=await configure(),first=await start(c);
    await rpc('checkpoint_with_errors',c.id,first.scanId,checkpoint(c,true,true),[],[]);
    expect(await lastError(c)).toMatch(/roots failed/);
    const next=await start(c),item=await reserve(c,next.scanId,source(c,'bad_file'));
    await rpc('parse_failure',c.id,item.itemId,'parse_pdf');
    await finish(c,next.scanId);
    expect(await lastError(c)).toBe('parse_pdf');
    expect((await status(c)).latestScan?.status).toBe('complete');
  });

  it('does not count leased, failed, retry-gated or pending updates as unchanged',async()=>{
    const c=await configure(),first=await start(c);
    for(const id of ['unchanged_file','leased_file','failed_file','gated_file','expired_file'])await publish(c,first.scanId,source(c,id));
    await finish(c,first.scanId);const next=await start(c);
    await reserve(c,next.scanId,source(c,'unchanged_file'));
    await reserve(c,next.scanId,source(c,'leased_file','v2'));
    const failed=await reserve(c,next.scanId,source(c,'failed_file','v2'));await rpc('parse_failure',c.id,failed.itemId,'parse_pdf');
    const expired=await reserve(c,next.scanId,source(c,'expired_file','v2'));await rpc('record_error',c.id,'Transfer failed',expired.itemId);
    for(let i=0;i<3;i++){const item=await reserve(c,next.scanId,source(c,'gated_file','v2'));await rpc('parse_failure',c.id,item.itemId,'parse_pdf');}
    expect((await reserve(c,next.scanId,source(c,'gated_file','v2'))).decision).toBe('unsupported');
    await reserve(c,next.scanId,source(c,'new_pending_file'));
    expect((await status(c)).latestScan?.unchanged).toBe(1);
  });

  it('does not count an update blocked by another scan’s active lease as unchanged',async()=>{
    const c=await configure(),first=await start(c);await publish(c,first.scanId,source(c,'shared_file'));await finish(c,first.scanId);
    const blocked=await start(c);await reserve(c,blocked.scanId,source(c,'shared_file','v2'));
    await rpc('checkpoint_with_errors',c.id,blocked.scanId,checkpoint(c,true,true),[],[]);
    const current=await start(c);
    expect((await reserve(c,current.scanId,source(c,'shared_file','v2'))).decision).toBe('retry_later');
    expect((await status(c)).latestScan?.unchanged).toBe(0);
  });
});
