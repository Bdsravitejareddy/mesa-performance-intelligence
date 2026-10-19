// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveSyncPanel } from './drive-sync-panel';
import type { DriveConnectionStatus } from '@/lib/drive-sync/contracts';
const connection: DriveConnectionStatus = {id:'connection',userId:'owner',enabled:true,label:'Mesa <script>alert(1)</script>',mappingRevision:1,mappings:[{id:'mapping',driveFolderId:'folder_123456',resourceKey:'0-root_KEY',mode:'collection',rootCourseTitle:'Root readings'}],lastError:null,lastScanAt:null,lastSuccessfulScanAt:null,paired:true,latestScan:{id:'scan',status:'failed',startedAt:'2026-10-19T00:00:00Z',completedAt:null,partial:true,completedRoots:0,imported:2,unchanged:5},counts:{total:3,indexed:1,unsupported:1,failed:1,unavailable:1},sources:[{id:'source1',driveFileId:'file1',name:'Old.pdf',sourceUrl:'https://drive.google.com/file/d/file1/view',courseId:'course',exportFormat:'pdf',available:false,version:1,failureCount:0,failureCode:null,extractionStatus:'complete'},{id:'source2',driveFileId:'file2',name:'Grades.xlsx',sourceUrl:null,courseId:'course',exportFormat:'unsupported',available:false,version:0,failureCount:0,failureCode:null,extractionStatus:null},{id:'source3',driveFileId:'file3',name:'Bad.pdf',sourceUrl:null,courseId:'course',exportFormat:'pdf',available:true,version:0,failureCount:3,failureCode:'parse_pdf',extractionStatus:null}]};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
describe('Drive sync setup and operational view',()=>{
  it('renders escaped account labels, folder keys, inventory exceptions and installation guidance',()=>{
    const html=renderToStaticMarkup(createElement(DriveSyncPanel,{connections:[connection],courses:[],configured:true}));
    expect(html).toContain('Mesa &lt;script&gt;');expect(html).not.toContain('<script>');
    for(const text of ['Partial','Source unavailable','Unsupported','Automatic retries paused','Retry source','Re-pair','Disable','Read-only Drive','install()','15 minutes'])expect(html).toContain(text);
    expect(html).toContain('https://drive.google.com/drive/folders/folder_123456?resourcekey=0-root_KEY');
  });
  it('shows missing server configuration and prevents connector creation',()=>{
    const html=renderToStaticMarkup(createElement(DriveSyncPanel,{connections:[],courses:[],configured:false}));
    expect(html).toContain('unavailable'); expect(html).not.toContain('<form');
  });
  it('polls read-only management status without triggering imports and clears its timer',async()=>{
    vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({configured:true,connections:[connection]})});vi.stubGlobal('fetch',fetcher);
    const host=document.createElement('div'),root=createRoot(host);
    await act(async()=>root.render(createElement(DriveSyncPanel,{connections:[connection],courses:[],configured:true})));
    await act(async()=>vi.advanceTimersByTime(30000));
    expect(fetcher).toHaveBeenCalledWith('/api/drive-sync/connections',{cache:'no-store'});
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(host.textContent).toContain('Partial');
    await act(async()=>root.unmount());await act(async()=>vi.advanceTimersByTime(60000));expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('lets a member reset a three-failure source without initiating an import',async()=>{
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const fetcher=vi.fn().mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('/retry')?{ok:true}:{configured:true,connections:[connection]}}));vi.stubGlobal('fetch',fetcher);
    const host=document.createElement('div'),root=createRoot(host);
    await act(async()=>root.render(createElement(DriveSyncPanel,{connections:[connection],courses:[],configured:true})));
    const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Retry source')!;
    await act(async()=>button.click());
    expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['/api/drive-sync/sources/source3/retry','/api/drive-sync/connections']);
    expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',body:'{}'});
    await act(async()=>root.unmount());
  });  it('clears private installation files at expiry without persisting credentials',async()=>{
    vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const storage=vi.spyOn(Storage.prototype,'setItem');
    const fetcher=vi.fn().mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('/pairing')?{expiresAt:new Date(Date.now()+15*60000).toISOString(),pairingCode:'private-pairing',setup:{code:'private-pairing-in-source',manifest:'{}'}}:{configured:true,connections:[connection]}}));vi.stubGlobal('fetch',fetcher);
    const host=document.createElement('div'),root=createRoot(host);
    await act(async()=>root.render(createElement(DriveSyncPanel,{connections:[connection],courses:[],configured:true})));
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.startsWith('Re-pair'))!.click());
    expect(host.textContent).toContain('Download Code.gs');expect(host.innerHTML).not.toContain('private-pairing');expect(storage).not.toHaveBeenCalled();
    await act(async()=>vi.advanceTimersByTime(15*60000));
    expect(host.textContent).not.toContain('Download Code.gs');expect(host.textContent).toContain('installer has expired');
    await act(async()=>root.unmount());
  });
  it('edits configured folders through PATCH without issuing a new installer',async()=>{
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const fetcher=vi.fn().mockImplementation(async(url:string)=>({ok:true,json:async()=>url==='/api/drive-sync/connections'?{configured:true,connections:[connection]}:{connection}}));vi.stubGlobal('fetch',fetcher);
    const host=document.createElement('div'),root=createRoot(host);
    await act(async()=>root.render(createElement(DriveSyncPanel,{connections:[connection],courses:[],configured:true})));
    const form=[...host.querySelectorAll('button')].find(b=>b.textContent==='Save settings')!.closest('form')!;
    await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['/api/drive-sync/connections/connection','/api/drive-sync/connections']);
    const request=fetcher.mock.calls[0][1];expect(request.method).toBe('PATCH');expect(JSON.parse(request.body).mappings[0].driveFolderId).toContain('resourcekey=0-root_KEY');
    await act(async()=>root.unmount());
  });

});
