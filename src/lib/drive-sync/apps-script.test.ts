import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderDriveScript } from "./script";

type File = { id: string; name: string; mimeType: string; version?: string; modifiedTime?: string; resourceKey?: string; shortcutDetails?: { targetId: string; targetResourceKey?: string }; size?: string };
type Request = { url: string; method?: string; headers?: Record<string,string>; payload?: unknown; followRedirects?: boolean; contentType?: string };
type State = { roots: Record<string, { pendingFolders: {id:string;pageToken?:string}[]; pendingFiles?: {driveFileId:string}[]; completed:boolean; failed:boolean; nextPageToken?:string; visitedFolderIds:string[] }> };
const pdf = (id: string): File => ({ id, name: `${id}.pdf`, mimeType: "application/pdf", version: "7", modifiedTime: "2026-10-19T00:00:00Z" });
const folder = (id: string): File => ({ id, name: id, mimeType: "application/vnd.google-apps.folder" });
const clone = <T>(value:T):T => JSON.parse(JSON.stringify(value));

async function harness(options: {pages?:Record<string,{files:File[];nextPageToken?:string;incompleteSearch?:boolean}>; metadata?:Record<string,File>; checkpoint?:State; installed?:boolean; lockAvailable?:boolean; downloadBytes?:Uint8Array; hook?:(request:Request)=>{status:number;body?:unknown;headers?:Record<string,string>}|undefined} = {}) {
  const rendered = await renderDriveScript({baseUrl:"https://dashboard.example",storageOrigin:"https://project.supabase.co",pairingCode:"one-time-code"});
  let now = Date.parse("2026-10-19T00:00:00Z");
  const properties:Record<string,string> = options.installed ? {connectorToken:"connector-secret",connectionId:"connection"} : {};
  const requests:Request[] = [], sleeps:number[] = [], checkpoints:unknown[] = [], uploads:Request[] = [], finalized:string[] = [];
  const triggers:{handler:string;interval?:number;delay?:number;getHandlerFunction:()=>string}[] = [];
  let state:State | null = options.checkpoint ?? null;
  const mapping = {id:"mapping",driveFolderId:"root",mode:"course",courseId:"course",rootCourseTitle:"Economics"};
  const response = (status:number,body:unknown = {},headers:Record<string,string> = {}) => ({ getResponseCode:()=>status, getContentText:()=>typeof body === "string" ? body : JSON.stringify(body), getAllHeaders:()=>headers, getBlob:()=>({getBytes:()=>options.downloadBytes ?? [0,255,10]}) });
  const context = vm.createContext({
    Date: class extends Date { static now(){return now;} constructor(value?:string|number){super(value ?? now);} },
    PropertiesService:{getScriptProperties:()=>({getProperty:(key:string)=>properties[key] ?? null,setProperty:(key:string,value:string)=>{properties[key]=value;},deleteProperty:(key:string)=>{delete properties[key];}})},
    LockService:{getScriptLock:()=>({tryLock:()=>options.lockAvailable !== false,releaseLock:()=>{}})},
    Utilities:{sleep:(ms:number)=>{sleeps.push(ms);now+=ms;},newBlob:(text:string)=>({getBytes:()=>Array.from(Buffer.from(text))})},
    ScriptApp:{getOAuthToken:()=>"google-secret",getProjectTriggers:()=>triggers.slice(),deleteTrigger:(trigger:unknown)=>{const index=triggers.indexOf(trigger as typeof triggers[number]);if(index>=0)triggers.splice(index,1);},newTrigger:(handler:string)=>{const trigger={handler,getHandlerFunction:()=>handler,interval:undefined as number|undefined,delay:undefined as number|undefined};const builder={timeBased:()=>builder,everyDays:(n:number)=>{trigger.interval=n;return builder;},atHour:()=>builder,after:(n:number)=>{trigger.delay=n;return builder;},create:()=>{triggers.push(trigger);return trigger;}};return builder;}},
    UrlFetchApp:{fetch:(url:string,args:Omit<Request,"url">)=>{
      const req = {url,...args}; requests.push(req);
      const override = options.hook?.(req); if(override)return response(override.status,override.body,override.headers);
      const parsed=new URL(url), path=parsed.pathname;
      if(parsed.origin==="https://dashboard.example") {
        const body=JSON.parse(String(req.payload));
        if(path.endsWith("/pair"))return response(200,{connectionId:"connection",token:"connector-secret"});
        if(path.endsWith("/session"))return response(200,{scanId:"scan",checkpoint:state,mappings:[mapping]});
        if(path.endsWith("/inventory"))return response(200,{decisions:body.files.map((f:{driveFileId:string})=>({driveFileId:f.driveFileId,action:"upload",itemId:`item-${f.driveFileId}`}))});
        if(path.endsWith("/upload"))return response(200,{signedUrl:`https://project.supabase.co/storage/v1/object/upload/sign/${body.itemId}?token=storage-secret`,storageOrigin:"https://project.supabase.co"});
        if(path.endsWith("/finalize")){finalized.push(body.itemId);return response(200,{materialId:"material",version:1,status:"imported"});}
        if(path.endsWith("/checkpoint")){state=clone(body.checkpoint);checkpoints.push(clone(body));return response(200,{ok:true});}
      }
      if(parsed.origin==="https://www.googleapis.com") {
        if(path==="/drive/v3/files"){
          const parent=parsed.searchParams.get("q")?.match(/^'(.+)' in parents/)?.[1];
          return response(200,options.pages?.[`${parent}:${parsed.searchParams.get("pageToken") ?? ""}`] ?? {files:[]});
        }
        const id=decodeURIComponent(path.split("/")[4] ?? "");
        if(parsed.searchParams.get("alt")==="media" || path.endsWith("/export"))return response(200,"binary");
        return response(200,options.metadata?.[id] ?? pdf(id));
      }
      if(parsed.origin==="https://project.supabase.co"){uploads.push(req);return response(200,{});}
      throw new Error("Unexpected origin");
    }},
  });
  vm.runInContext(rendered.code,context);
  return {context,properties,requests,sleeps,triggers,uploads,finalized,checkpoints,get state(){return state;},advance:(ms:number)=>{now+=ms;},setDay:(date:string)=>{now=Date.parse(date);},mapping};
}

describe("Drive Apps Script runtime",()=>{
  it("installs one daily trigger and starts importing; reinstallation uses the stored credential",async()=>{
    const h=await harness({pages:{"root:":{files:[pdf("a")]}}});
    vm.runInContext("install(); install()",h.context);
    expect(h.triggers.map(t=>[t.handler,t.interval])).toEqual([["syncDrive",1]]);
    expect(h.requests.filter(r=>r.url.endsWith("/pair"))).toHaveLength(1);
    expect(h.finalized).toContain("item-a");
    expect(h.properties.connectorToken).toBe("connector-secret");
    expect(Object.keys(h.properties).sort()).toEqual(["connectionId","connectorToken","runtimeDay","runtimeMs"]);
  });

  it("uses a configured root resource key on the first listing and persists it in checkpoints",async()=>{
    const h=await harness({installed:true});
    Object.assign(h.mapping,{resourceKey:'0-root_KEY'});
    vm.runInContext('syncDrive()',h.context);
    const listing=h.requests.find(r=>r.url.startsWith('https://www.googleapis.com/drive/v3/files?'))!;
    expect(listing.headers?.['X-Goog-Drive-Resource-Keys']).toBe('root/0-root_KEY');
    expect(h.checkpoints[0]).toMatchObject({checkpoint:{roots:{mapping:{pendingFolders:[{id:"root",resourceKey:"0-root_KEY"}]}}}});
  });

  it("exports Docs as PDF, Slides as PPTX and transfers binary bytes without bearer credentials",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[{...pdf("doc"),mimeType:"application/vnd.google-apps.document"},{...pdf("slides"),mimeType:"application/vnd.google-apps.presentation"},pdf("binary")]}}});
    vm.runInContext("syncDrive()",h.context);
    const exports=h.requests.filter(r=>r.url.includes("/export"));
    expect(exports.map(r=>new URL(r.url).searchParams.get("mimeType"))).toEqual(["application/pdf","application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
    expect(h.uploads).toHaveLength(3);
    for(const req of h.uploads){expect(req.payload).toEqual([0,255,10]);expect(req.headers?.Authorization).toBeUndefined();expect(req.method).toBe("put");expect(req.followRedirects).toBe(false);}
    for(const req of h.requests){expect(req.followRedirects).toBe(false);if(!req.url.startsWith("https://www.googleapis.com/"))expect(JSON.stringify(req)).not.toContain("google-secret");}
  });

  it("traverses shared drive pages and resolves folder shortcuts without revisiting cycles",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[folder("sub")],nextPageToken:"page2"},"root:page2":{files:[pdf("a")]},"sub:":{files:[{id:"shortcut",name:"loop",mimeType:"application/vnd.google-apps.shortcut",shortcutDetails:{targetId:"root",targetResourceKey:"key"}}]}},metadata:{root:folder("root")}});
    vm.runInContext("syncDrive()",h.context);
    expect(h.finalized).toEqual(["item-a"]);
    const lists=h.requests.filter(r=>new URL(r.url).pathname==="/drive/v3/files");
    expect(lists).toHaveLength(3);
    for(const req of lists){const p=new URL(req.url).searchParams;expect(p.get("supportsAllDrives")).toBe("true");expect(p.get("includeItemsFromAllDrives")).toBe("true");}
    expect((h.checkpoints.at(-1) as {completedRootIds:string[]}).completedRootIds).toEqual(["mapping"]);
  });

  it("uses a shortcut target's canonical identity, version and resource key",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[{id:"link",name:"alias",mimeType:"application/vnd.google-apps.shortcut",shortcutDetails:{targetId:"target",targetResourceKey:"resource"}}]}},metadata:{target:pdf("target")}});
    vm.runInContext("syncDrive()",h.context);
    const req=h.requests.find(r=>r.url.endsWith("/inventory"))!;
    const source=JSON.parse(String(req.payload)).files[0];
    expect(source.driveFileId).toBe("target");expect(source.targetId).toBe("target");expect(source.fingerprint).toContain("7");
    expect(source.sourceUrl).toBe("https://drive.google.com/file/d/target/view?resourcekey=resource");
    const download=h.requests.find(r=>r.url.includes("alt=media"))!;
    expect(download.headers?.["X-Goog-Drive-Resource-Keys"]).toBe("target/resource");
  });

  it("retries transient requests at most three times and honors Retry-After",async()=>{
    let attempts=0;
    const h=await harness({installed:true,hook:r=>r.url.endsWith("/session") && attempts++<3 ? {status:429,body:{error:"busy"},headers:{"Retry-After":"2"}}:undefined});
    vm.runInContext("syncDrive()",h.context);
    expect(h.sleeps).toEqual([2000,2000,4000]);expect(attempts).toBe(4);
  });

  it("preserves the exact page and pending file after a failed batch; continuation resumes without skipping",async()=>{
    let fail=true;
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a"),pdf("b")],nextPageToken:"page2"},"root:page2":{files:[pdf("c")]}},hook:r=>r.url.endsWith("/finalize") && JSON.parse(String(r.payload)).itemId==="item-b" && fail ? {status:503}:undefined});
    expect(()=>vm.runInContext("syncDrive()",h.context)).toThrow();
    expect(h.state?.roots.mapping.pendingFiles?.map(f=>f.driveFileId)).toEqual(["b"]);
    expect(h.state?.roots.mapping.pendingFolders[0].pageToken).toBeUndefined();
    expect(h.checkpoints.every(c=>(c as {completedRootIds:string[]}).completedRootIds.length===0)).toBe(true);
    expect(h.triggers.filter(t=>t.handler==="resumeDrive").map(t=>t.delay)).toEqual([60000]);
    fail=false;vm.runInContext("resumeDrive()",h.context);
    expect(h.finalized).toEqual(["item-a","item-b","item-c"]);
    expect(h.triggers.filter(t=>t.handler==="resumeDrive")).toHaveLength(0);
  });

  it("stops before the work deadline and deduplicates continuation triggers",async()=>{
    const h:Awaited<ReturnType<typeof harness>>=await harness({installed:true,pages:{"root:":{files:[pdf("a"),pdf("b")]}},hook:r=>{if(r.url.endsWith("/finalize"))h.advance(230000);return undefined;}});
    vm.runInContext("syncDrive()",h.context);
    expect(h.state?.roots.mapping.pendingFiles?.map(f=>f.driveFileId)).toEqual(["b"]);
    expect(Number(h.properties.runtimeMs)).toBeLessThan(360000);
    expect(h.triggers.filter(t=>t.handler==="resumeDrive")).toHaveLength(1);
    vm.runInContext("resumeDrive()",h.context);
    expect(h.triggers.filter(t=>t.handler==="resumeDrive")).toHaveLength(0);
  });

  it("caps the daily execution budget and resets it on the next UTC day",async()=>{
    const h=await harness({installed:true});h.properties.runtimeDay="2026-10-19";h.properties.runtimeMs="1800000";
    vm.runInContext("syncDrive()",h.context);expect(h.requests).toHaveLength(0);
    h.setDay("2026-10-20T00:00:00Z");vm.runInContext("syncDrive()",h.context);
    expect(h.requests.some(r=>r.url.endsWith("/session"))).toBe(true);expect(h.properties.runtimeDay).toBe("2026-10-20");
  });

  it("defers work near UTC midnight so a run cannot borrow tomorrow's daily budget",async()=>{
    const h=await harness({installed:true});h.setDay("2026-10-19T23:59:50Z");
    vm.runInContext("syncDrive()",h.context);expect(h.requests).toHaveLength(0);expect(h.triggers.map(t=>t.handler)).toEqual(["resumeDrive"]);
    h.advance(60000);vm.runInContext("resumeDrive()",h.context);expect(h.properties.runtimeDay).toBe("2026-10-20");expect(h.triggers).toEqual([]);
  });

  it.each(["https://evil.example/upload","https://project.supabase.co.evil.example/upload","https://user:pass@project.supabase.co/upload","http://project.supabase.co/upload"])("rejects a malicious signed upload destination: %s",async signedUrl=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a")]}},hook:r=>r.url.endsWith("/upload")?{status:200,body:{signedUrl,storageOrigin:"https://project.supabase.co"}}:undefined});
    vm.runInContext("syncDrive()",h.context);
    expect(h.uploads).toHaveLength(0);expect(h.finalized).toHaveLength(0);
    expect(h.requests.some(r=>r.url.startsWith(signedUrl))).toBe(false);
    expect((h.checkpoints.at(-1) as {errors?:unknown[]}).errors?.length ?? h.checkpoints.some(c=>(c as {errors?:unknown[]}).errors?.length)).toBeTruthy();
  });

  it("rejects upload redirects without forwarding credentials or finalizing",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a")]}},hook:r=>r.url.startsWith("https://project.supabase.co/")?{status:307,headers:{Location:"https://evil.example"}}:undefined});
    vm.runInContext("syncDrive()",h.context);
    expect(h.finalized).toHaveLength(0);expect(h.requests.some(r=>r.url.startsWith("https://evil.example"))).toBe(false);
  });

  it("does not declare an inaccessible root complete or delete unseen files",async()=>{
    const h=await harness({installed:true,hook:r=>new URL(r.url).pathname==="/drive/v3/files"?{status:403,body:{error:{message:"permission denied"}}}:undefined});
    vm.runInContext("syncDrive()",h.context);
    expect(h.state?.roots.mapping.failed).toBe(true);expect(h.state?.roots.mapping.completed).toBe(false);
    expect((h.checkpoints.at(-1) as {completedRootIds:string[]}).completedRootIds).toEqual([]);
  });

  it("does not mark an incomplete Drive search as a completed root",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[],incompleteSearch:true}}});vm.runInContext("syncDrive()",h.context);
    expect(h.state?.roots.mapping.failed).toBe(true);
    expect((h.checkpoints.at(-1) as {completedRootIds:string[]}).completedRootIds).toEqual([]);
  });

  it.each([{decisions:[]},{decisions:[{driveFileId:"a",action:"upload"}]},"not json"])("preserves the batch on malformed inventory responses: %j",async body=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a")]}},hook:r=>r.url.endsWith("/inventory")?{status:200,body}:undefined});
    expect(()=>vm.runInContext("syncDrive()",h.context)).toThrow();
    expect(h.state?.roots.mapping.pendingFiles?.map(f=>f.driveFileId)).toEqual(["a"]);
    expect(h.finalized).toHaveLength(0);
  });

  it("keeps names containing script delimiters as data",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[{...pdf("a"),name:"</script>\"; throw new Error('injected'); //"}]}}});
    vm.runInContext("syncDrive()",h.context);
    const request=h.requests.find(r=>r.url.endsWith("/inventory"))!;
    expect(JSON.parse(String(request.payload)).files[0].name).toBe("</script>\"; throw new Error('injected'); //");expect(h.finalized).toEqual(["item-a"]);
  });

  it("uninstalls only agent triggers and preserves the connector credential",async()=>{
    const h=await harness({installed:true});vm.runInContext("install(); ScriptApp.newTrigger('other').timeBased().everyDays(1).create(); uninstallTriggers()",h.context);
    expect(h.triggers.map(t=>t.handler)).toEqual(["other"]);expect(h.properties.connectorToken).toBe("connector-secret");
  });

  it("preserves the previous checkpoint when capacity would exceed 256 KiB",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[{...pdf("a"),name:"x".repeat(262145)}]}}});
    expect(()=>vm.runInContext("syncDrive()",h.context)).toThrow("Checkpoint capacity exceeded; previous state preserved");
    expect(h.state?.roots.mapping.pendingFolders.map(f=>f.id)).toEqual(["root"]);
    expect(h.state?.roots.mapping.pendingFiles).toBeUndefined();
    expect(h.requests.some(r=>r.url.endsWith("/inventory"))).toBe(false);
  });

  it("does not consume pending files when a server checkpoint rejects capacity",async()=>{
    let writes=0;
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a")]}},hook:r=>r.url.endsWith("/checkpoint") && ++writes===2 ? {status:413,body:{error:"checkpoint too large"}}:undefined});
    expect(()=>vm.runInContext("syncDrive()",h.context)).toThrow("Checkpoint capacity exceeded; previous state preserved");
    expect(h.state?.roots.mapping.pendingFiles).toBeUndefined();expect(h.finalized).toHaveLength(0);
  });

  it("continues after a terminal file error while recording the failure",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("bad"),pdf("good")]}},hook:r=>r.url.includes("/files/bad?") && r.url.includes("alt=media") ? {status:403}:undefined});
    vm.runInContext("syncDrive()",h.context);
    expect(h.finalized).toEqual(["item-good"]);
    expect(h.checkpoints.some(c=>(c as {errors?:{driveFileId:string;itemId?:string}[]}).errors?.some(e=>e.driveFileId==="bad" && e.itemId==="item-bad"))).toBe(true);
    expect(h.state?.roots.mapping.completed).toBe(true);
  });

  it("leaves a busy inventory item pending for a continuation",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a")]}},hook:r=>r.url.endsWith("/inventory")?{status:200,body:{decisions:[{driveFileId:"a",action:"retry_later"}]}}:undefined});
    expect(()=>vm.runInContext("syncDrive()",h.context)).toThrow();
    expect(h.state?.roots.mapping.pendingFiles?.map(f=>f.driveFileId)).toEqual(["a"]);expect(h.triggers.map(t=>t.handler)).toEqual(["resumeDrive"]);
  });

  it("records unsupported and unchanged inventory without downloading bytes",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a"),pdf("b")]}},hook:r=>r.url.endsWith("/inventory")?{status:200,body:{decisions:[{driveFileId:"a",action:"unsupported"},{driveFileId:"b",action:"unchanged"}]}}:undefined});
    vm.runInContext("syncDrive()",h.context);expect(h.uploads).toHaveLength(0);expect(h.state?.roots.mapping.completed).toBe(true);
  });

  it("does not begin a retry when Retry-After exceeds the remaining budget",async()=>{
    const h=await harness({installed:true,hook:r=>r.url.endsWith("/session")?{status:503,headers:{"Retry-After":"300"}}:undefined});
    expect(()=>vm.runInContext("syncDrive()",h.context)).toThrow();expect(h.sleeps).toEqual([]);
    expect(h.requests.filter(r=>r.url.endsWith("/session"))).toHaveLength(1);
  });

  it("finalizes an already present signed upload object after a 409 retry",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a")]}},hook:r=>r.url.startsWith("https://project.supabase.co/")?{status:409}:undefined});
    vm.runInContext("syncDrive()",h.context);expect(h.finalized).toEqual(["item-a"]);
  });

  it("limits each resumed metadata batch to 100 files",async()=>{
    const pending=Array.from({length:101},(_,i)=>({driveFileId:`f${i}`,name:`f${i}.pdf`,mimeType:"application/pdf",parentId:"root",sourceUrl:`https://drive.google.com/file/d/f${i}/view`,fingerprint:"7",folderMappingId:"mapping",courseFolderId:"root",courseFolderTitle:"Economics"}));
    const h=await harness({installed:true,checkpoint:{roots:{mapping:{pendingFolders:[{id:"root"}],visitedFolderIds:[],completed:false,failed:false,pendingFiles:pending,nextPageToken:""}}},hook:r=>r.url.endsWith("/inventory")?{status:200,body:{decisions:JSON.parse(String(r.payload)).files.map((f:{driveFileId:string})=>({driveFileId:f.driveFileId,action:"unchanged"}))}}:undefined});
    vm.runInContext("syncDrive()",h.context);
    expect(h.requests.filter(r=>r.url.endsWith("/inventory")).map(r=>JSON.parse(String(r.payload)).files.length)).toEqual([100,1]);expect(h.state?.roots.mapping.completed).toBe(true);
  });

  it("does no network work if another invocation holds the script lock",async()=>{
    const h=await harness({installed:true,lockAvailable:false});vm.runInContext("syncDrive(); install(); uninstallTriggers()",h.context);expect(h.requests).toHaveLength(0);expect(h.triggers).toHaveLength(0);
  });

  it("reserves the six-minute platform maximum before the first network request",async()=>{
    let reserved=0;
    const h:Awaited<ReturnType<typeof harness>>=await harness({installed:true,hook:r=>{if(r.url.endsWith("/session"))reserved=Number(h.properties.runtimeMs);return undefined;}});
    vm.runInContext("syncDrive()",h.context);expect(reserved).toBe(360000);
  });

  it("skips a file over 20 MiB before download and continues the acknowledged page",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[{...pdf("large"),size:"20971521"},{...pdf("allowed"),size:"20971520"}]}}});
    vm.runInContext("syncDrive()",h.context);
    expect(h.requests.some(r=>r.url.includes("/files/large?") || r.url.endsWith("/upload") && JSON.parse(String(r.payload)).itemId==="item-large")).toBe(false);
    expect(h.finalized).toEqual(["item-allowed"]);
    expect(h.checkpoints.some(c=>(c as {errors?:{driveFileId:string;itemId?:string;message:string}[]}).errors?.some(e=>e.driveFileId==="large" && e.itemId==="item-large" && e.message.includes("20 MiB")))).toBe(true);
    expect(h.state?.roots.mapping.completed).toBe(true);expect(h.triggers).toEqual([]);
  });

  it.each(["application/vnd.google-apps.document","application/vnd.google-apps.presentation"])("accepts a native source over 20 MiB when its export fits: %s",async mimeType=>{
    const h=await harness({installed:true,pages:{"root:":{files:[{...pdf("native"),mimeType,size:"20971521"}]}}});
    vm.runInContext("syncDrive()",h.context);
    expect(h.requests.filter(r=>r.url.includes("/files/native/export?"))).toHaveLength(1);
    expect(h.uploads).toHaveLength(1);expect(h.finalized).toEqual(["item-native"]);expect(h.state?.roots.mapping.completed).toBe(true);
    expect(h.checkpoints.some(c=>(c as {errors?:unknown[]}).errors?.length)).toBe(false);
  });

  it("records a permanent UrlFetch size failure once and continues other files",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("large"),pdf("good")]}},hook:r=>{if(r.url.includes("/files/large?") && r.url.includes("alt=media"))throw new Error("Limit exceeded: URL Fetch response size. google-secret");return undefined;}});
    vm.runInContext("syncDrive()",h.context);
    expect(h.requests.filter(r=>r.url.includes("/files/large?") && r.url.includes("alt=media"))).toHaveLength(1);
    expect(h.finalized).toEqual(["item-good"]);expect(h.sleeps).toEqual([]);
    expect(JSON.stringify(h.checkpoints)).not.toContain("google-secret");expect(h.state?.roots.mapping.completed).toBe(true);
  });

  it("still retries temporary UrlFetch transport failures",async()=>{
    let failures=0;
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a")]}},hook:r=>{if(r.url.includes("alt=media") && failures++<3)throw new Error("Temporary DNS failure");return undefined;}});
    vm.runInContext("syncDrive()",h.context);expect(h.sleeps).toEqual([1000,2000,4000]);expect(h.finalized).toEqual(["item-a"]);
  });

  it("rejects oversized downloaded bytes when metadata did not provide a size",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a")]}},downloadBytes:new Uint8Array(20971521)});
    vm.runInContext("syncDrive()",h.context);expect(h.uploads).toHaveLength(0);expect(h.finalized).toEqual([]);
    expect(h.checkpoints.some(c=>(c as {errors?:{itemId?:string;message:string}[]}).errors?.some(e=>e.itemId==="item-a" && e.message.includes("20 MiB")))).toBe(true);expect(h.state?.roots.mapping.completed).toBe(true);
  });

  it("records invalid UrlFetch requests as permanent rather than blocking later files",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("bad"),pdf("good")]}},hook:r=>{if(r.url.includes("/files/bad?") && r.url.includes("alt=media"))throw new Error("Invalid argument: header google-secret");return undefined;}});
    vm.runInContext("syncDrive()",h.context);expect(h.finalized).toEqual(["item-good"]);expect(h.sleeps).toEqual([]);expect(JSON.stringify(h.checkpoints)).not.toContain("google-secret");
  });

  it("retains worst-case reservations when the platform forcibly terminates five runs",async()=>{
    const h=await harness({installed:true});
    vm.runInContext("var blockedCalls = 0; UrlFetchApp.fetch = function() { blockedCalls++; while (true) {} };",h.context);
    for(let run=1;run<=5;run++){
      // VM timeouts terminate JavaScript without running its catch/finally,
      // matching Apps Script's forced execution limit rather than throwing an
      // ordinary catchable fetch error. A fresh invocation resets global state.
      expect(()=>vm.runInContext("DRIVE_RUN = null; syncDrive()",h.context,{timeout:15})).toThrow("Script execution timed out");
      expect(h.properties.runtimeMs).toBe(String(run*360000));h.advance(360000);
    }
    expect(()=>vm.runInContext("DRIVE_RUN = null; syncDrive()",h.context,{timeout:50})).not.toThrow();
    expect(vm.runInContext("blockedCalls",h.context)).toBe(5);expect(h.properties.runtimeMs).toBe("1800000");
  });

  it("does not start another fetch when less than one platform execution remains in the daily budget",async()=>{
    const h=await harness({installed:true});h.properties.runtimeDay="2026-10-19";h.properties.runtimeMs="1500000";
    vm.runInContext("syncDrive()",h.context);expect(h.requests).toEqual([]);expect(h.properties.runtimeMs).toBe("1500000");expect(h.triggers).toEqual([]);
  });

  it("defers during the last six minutes of a day so hard termination cannot spill across days",async()=>{
    const h=await harness({installed:true});h.setDay("2026-10-19T23:55:00Z");
    vm.runInContext("syncDrive()",h.context);expect(h.requests).toEqual([]);expect(h.triggers.map(t=>t.handler)).toEqual(["resumeDrive"]);
    h.advance(360000);vm.runInContext("resumeDrive()",h.context);expect(h.properties.runtimeDay).toBe("2026-10-20");expect(h.requests.some(r=>r.url.endsWith("/session"))).toBe(true);
  });

  it("accounts for actual elapsed time after a catchable failure",async()=>{
    const completed=await harness({installed:true});vm.runInContext("syncDrive()",completed.context);expect(completed.properties.runtimeMs).toBe("0");
    const paused=await harness({installed:true,hook:r=>r.url.endsWith("/session")?{status:503}:undefined});
    expect(()=>vm.runInContext("syncDrive()",paused.context)).toThrow();expect(paused.properties.runtimeMs).toBe("7000");
  });

  it("can resume after six brief lease waits without exhausting the daily runtime budget",async()=>{
    let waits=0;
    const h=await harness({installed:true,pages:{"root:":{files:[pdf("a")]}},hook:r=>r.url.endsWith("/inventory") && waits++<6 ? {status:200,body:{decisions:[{driveFileId:"a",action:"retry_later"}]}}:undefined});
    for(let run=0;run<6;run++){
      try { vm.runInContext("resumeDrive()",h.context); } catch { /* saved checkpoint is retried */ }
      h.advance(60000);
    }
    vm.runInContext("resumeDrive()",h.context);
    expect(h.finalized).toEqual(["item-a"]);
    expect(h.state?.roots.mapping.completed).toBe(true);
  });

  it("preserves a page when source version metadata is missing",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[{id:"a",name:"a.pdf",mimeType:"application/pdf"}]}}});
    expect(()=>vm.runInContext("syncDrive()",h.context)).toThrow();
    expect(h.requests.some(r=>r.url.endsWith("/inventory"))).toBe(false);expect(h.state?.roots.mapping.pendingFolders.map(f=>f.id)).toEqual(["root"]);
  });

  it("continues other folders after one inaccessible nested folder",async()=>{
    const h=await harness({installed:true,pages:{"root:":{files:[folder("bad"),folder("good")]},"good:":{files:[pdf("a")]}},hook:r=>new URL(r.url).pathname==="/drive/v3/files" && new URL(r.url).searchParams.get("q")?.startsWith("'bad'")?{status:403}:undefined});
    vm.runInContext("syncDrive()",h.context);expect(h.finalized).toEqual(["item-a"]);expect(h.state?.roots.mapping.failed).toBe(true);expect(h.state?.roots.mapping.pendingFolders).toEqual([]);
    expect((h.checkpoints.at(-1) as {completedRootIds:string[]}).completedRootIds).toEqual([]);expect(h.triggers).toEqual([]);
  });
});

describe("safe script renderer",()=>{
  it("round trips hostile pairing text through JSON without executing it",async()=>{
    const rendered=await renderDriveScript({baseUrl:"https://dashboard.example/",storageOrigin:"https://project.supabase.co",pairingCode:'</script>\";globalThis.compromised=true;//\u2028'});
    const context=vm.createContext({});vm.runInContext(rendered.code,context);
    expect(context.compromised).toBeUndefined();expect(rendered.code).not.toContain("</script>");
    expect(vm.runInContext("DRIVE_AGENT_CONFIG.pairingCode",context)).toBe('</script>\";globalThis.compromised=true;//\u2028');
    const manifest=JSON.parse(rendered.manifest);expect(manifest.runtimeVersion).toBe("V8");
    expect(manifest.oauthScopes).toEqual(["https://www.googleapis.com/auth/drive.readonly","https://www.googleapis.com/auth/script.external_request","https://www.googleapis.com/auth/script.scriptapp"]);
    expect(manifest.dependencies.enabledAdvancedServices).toEqual([{userSymbol:"Drive",version:"v3",serviceId:"drive"}]);
  });
  it.each(["http://dashboard.example","https://user:password@dashboard.example","https://dashboard.example/?x=1","https://dashboard.example/path"])("rejects unsafe bootstrap origins: %s",async baseUrl=>{
    await expect(renderDriveScript({baseUrl,storageOrigin:"https://project.supabase.co",pairingCode:"code"})).rejects.toThrow();
  });
});
