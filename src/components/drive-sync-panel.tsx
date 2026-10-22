"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DriveConnectionStatus, FolderMappingInput } from '@/lib/drive-sync/contracts';
import { safeDriveSourceUrl } from '@/lib/drive-sync/source-url';

type Course = {id:string;title:string};
type Setup = {connectionId:string;expiresAt:string;code:string;manifest:string};
const newMapping = (): FolderMappingInput => ({driveFolderId:'',mode:'course',courseId:null,rootCourseTitle:''});
function folderLink(mapping: FolderMappingInput) {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(mapping.driveFolderId)}${mapping.resourceKey ? `?resourcekey=${encodeURIComponent(mapping.resourceKey)}` : ''}`;
}
function stateLabel(connection: DriveConnectionStatus) {
  if (!connection.enabled) return 'Paused';
  if (!connection.paired) return connection.latestScan ? 'Pairing required' : 'Never paired';
  if (connection.latestScan?.partial) return 'Partial';
  if (connection.lastError && (connection.latestScan?.status === 'running' || connection.latestScan?.status === 'complete')) return 'Needs review';
  if (connection.lastError || connection.latestScan?.status === 'failed') return 'Failed';
  if (connection.latestScan?.status === 'complete') return 'Completed';
  return 'Active';
}
function date(value: string | null) {return value ? new Date(value).toLocaleString() : 'Not yet recorded';}

export function DriveSyncPanel({connections:initial,courses,configured}: {connections:DriveConnectionStatus[];courses:Course[];configured:boolean}) {
  const [connections,setConnections]=useState(initial),[available,setAvailable]=useState(configured);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [setup,setSetup]=useState<Setup|null>(null),[expired,setExpired]=useState(false);
  useEffect(()=>{
    if (!configured) return;
    let disposed=false;
    const timer=setInterval(async()=>{
      try {
        const response=await fetch('/api/drive-sync/connections',{cache:'no-store'});
        const result=await response.json();
        if(!response.ok) throw new Error(result.error ?? 'Unable to refresh status.');
        if(!disposed){setConnections(result.connections);setAvailable(result.configured);setError('');}
      } catch {if(!disposed)setError('Status refresh failed. Stored results are shown; try refreshing the page.');}
    },30000);
    return ()=>{disposed=true;clearInterval(timer);};
  },[configured]);
  useEffect(()=>{
    if(!setup)return;
    const timer=setTimeout(()=>{setSetup(null);setExpired(true);},Math.max(0,new Date(setup.expiresAt).getTime()-Date.now()));
    return ()=>clearTimeout(timer);
  },[setup]);
  async function refresh() {
    const response=await fetch('/api/drive-sync/connections',{cache:'no-store'}),result=await response.json();
    if(!response.ok)throw new Error(result.error ?? 'Unable to refresh status.');
    setConnections(result.connections);setAvailable(result.configured);
  }
  async function mutate(url:string,method:string,body:unknown) {
    setBusy(true);setError('');setMessage('');
    try {
      const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
      const result=await response.json();if(!response.ok)throw new Error(result.error ?? 'Unable to save Drive settings.');
      if(result.setup){setSetup({connectionId:result.connection?.id ?? url.split('/').at(-2),expiresAt:result.expiresAt,...result.setup});setExpired(false);}
      else if(method==='PATCH' && (body as {enabled?:boolean}).enabled===false){setSetup(null);}
      setMessage(url.endsWith('/retry')?'Retry enabled for the next scheduled scan.':'Settings saved. Folder changes are picked up automatically on the next run.');
      await refresh();
    } catch(reason){setError(reason instanceof Error?reason.message:'Unable to save Drive settings.');}
    finally{setBusy(false);}
  }
  function download(name:string,text:string) {
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="drive-sync-stack">
    <div className="info-callout">Read-only Drive authorisation covers the installing account’s Drive. This importer processes only your configured roots. Separate Google accounts need separate installations only when their material cannot be read by one account.</div>
    {!available && <div className="info-callout" role="status">Live Drive sync is unavailable in preview mode or while server configuration is missing. A server-only Supabase secret and the Drive migrations are required before creating connectors.</div>}
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
    {expired && <div className="info-callout" role="status">The 15-minute installer has expired and was cleared from this page. Re-pair the connection to download a fresh installer.</div>}
    {setup && <section className="content-panel" aria-label="One-time installation files"><h2>Install once in the source Google account</h2><p>Single-use pairing expires at {date(setup.expiresAt)} (15 minutes after issue). The files contain the pairing code: keep them private and delete downloaded copies after installation. Re-pairing revokes the previous connector.</p><div className="drive-actions"><button className="button button-primary" type="button" onClick={()=>download('Code.gs',setup.code)}>Download Code.gs</button><button className="button" type="button" onClick={()=>download('appsscript.json',setup.manifest)}>Download appsscript.json</button><button className="button" type="button" onClick={()=>setSetup(null)}>Clear installation files</button></div><p>Once paired, the connector token stays in private Google Script Properties. No Google password, Google OAuth token, database key, or connector token is stored in this browser.</p></section>}
    <div className="section-two-column"><section className="content-panel"><h2>Source accounts <span className="panel-count">{connections.length}</span></h2><p>Both invited dashboard accounts share these connections and imported courses. Status refreshes every 30 seconds; viewing this page never starts an import.</p>
      {!connections.length && <div className="empty-copy">No source accounts configured. Add an account label and its course or collection folders.</div>}
      {connections.map(connection=><article className="drive-connection" key={connection.id}><div className="drive-connection-heading"><h3>{connection.label}</h3><span className={`status-pill${['Failed','Partial','Paused','Needs review'].includes(stateLabel(connection))?' warning':''}`}>{stateLabel(connection)}</span></div>
        <p className="scope-note">Last successful scan: {date(connection.lastSuccessfulScanAt)}. Last activity: {date(connection.lastScanAt)}. A completed inventory does not guarantee extraction success.</p>
        {connection.latestScan && <p className="scope-note">Latest scan: {connection.latestScan.status} · {connection.latestScan.completedRoots}/{connection.mappings.length} roots complete · {connection.latestScan.imported} imported · {connection.latestScan.unchanged} unchanged.</p>}
        <p className="scope-note">Inventory: {connection.counts.total} files · {connection.counts.indexed} indexed · {connection.counts.unsupported} unsupported · {connection.counts.failed} parse failures · {connection.counts.unavailable} unavailable.</p>
        {connection.lastError && <p className="form-error">Last error: {connection.lastError}</p>}
        <ul className="drive-folder-links">{connection.mappings.map(mapping=>mapping.mode==='submissions' ? <li key={mapping.id}>Submitted work · searches this account&apos;s own files by LMS assignment title</li> : <li key={mapping.id}><a className="text-link" href={folderLink(mapping)} target="_blank" rel="noreferrer">{mapping.rootCourseTitle} · {mapping.mode} folder ↗</a>{mapping.courseId && <> · <Link className="text-link" href={`/courses/${encodeURIComponent(mapping.courseId)}`}>Open course</Link></>}</li>)}</ul>
        {available && <><div className="drive-actions"><button type="button" className="button" disabled={busy} onClick={()=>mutate(`/api/drive-sync/connections/${connection.id}`,'PATCH',{enabled:!connection.enabled})}>{connection.enabled?'Disable':'Enable'}</button>{connection.enabled && <button className="button" type="button" disabled={busy} onClick={()=>mutate(`/api/drive-sync/connections/${connection.id}/pairing`,'POST',{})}>Re-pair / download installer</button>}</div><details className="drive-edit"><summary>Edit account label and folders</summary><p className="scope-note">Folder edits do not require reinstalling. Saving invalidates in-flight work; the next run uses the updated roots. Disabling revokes access and keeps existing imported versions.</p><MappingForm key={`${connection.id}-${connection.mappingRevision}`} connection={connection} courses={courses} disabled={busy} save={body=>mutate(`/api/drive-sync/connections/${connection.id}`,'PATCH',body)} /></details></>}
        {!!connection.sources.length && <div className="drive-inventory"><h4>Source inventory</h4><p className="scope-note">Showing {connection.sources.length} of {connection.counts.total} files; parse failures appear first. Unsupported files are inventoried without extraction.</p><table className="metric-table"><thead><tr><th>Source</th><th>Status</th><th>Action</th></tr></thead><tbody>{connection.sources.map(source=>{
          const url=safeDriveSourceUrl(source.driveFileId,source.sourceUrl ?? '');
          return <tr key={source.id}><td>{url?<a className="text-link" href={url} target="_blank" rel="noreferrer">{source.name} ↗</a>:source.name}<br/><Link className="text-link" href={`/courses/${encodeURIComponent(source.courseId)}`}>Course</Link></td><td>{source.exportFormat==='unsupported'?'Unsupported':source.failureCount>=3?'Automatic retries paused':source.failureCount?'Parse failed':source.version?'Indexed':'Pending import'}{source.version>0 && !source.available && <><br/>Source unavailable</>}{source.extractionStatus && <><br/>{source.extractionStatus.replaceAll('_',' ')} · v{source.version}</>}{source.failureCode && <><br/>{source.failureCode} ({source.failureCount} failures)</>}</td><td>{source.failureCount>=3 && available && connection.enabled && <button className="button" disabled={busy} type="button" onClick={()=>mutate(`/api/drive-sync/sources/${source.id}/retry`,'POST',{})}>Retry source</button>}</td></tr>;
        })}</tbody></table></div>}
      </article>)}
    </section><aside className="drive-sync-stack">{available && <section className="content-panel"><h2>Add a source account</h2><p>Use a label such as Personal Drive or Mesa Drive. Add 1–20 roots; keep resource keys in shared folder links.</p><MappingForm courses={courses} disabled={busy} save={body=>mutate('/api/drive-sync/connections','POST',body)}/></section>}<section className="content-panel"><h2>One-time Google installation</h2><ol className="drive-instructions"><li>Save a source account to generate its private installer, valid for 15 minutes.</li><li>Open <a className="text-link" href="https://script.google.com/home/start" target="_blank" rel="noreferrer">Apps Script</a> while using the Google account that can access these folders. Create a standalone project.</li><li>Paste downloaded Code.gs. In Project Settings, enable “Show appsscript.json manifest file in editor”, then paste the supplied manifest.</li><li>The manifest declares Drive API v3. With the default Google Cloud project, adding the Drive advanced service enables its API automatically. If using a standard Cloud project, enable Google Drive API there as well.</li><li>Run <code>install()</code> and approve Google consent for read-only Drive, external requests, and trigger management. School policies may block approval.</li><li>Installation starts the first import and creates one daily trigger. Large libraries resume automatically within runtime quotas. Verify a real import and a later automatic trigger before treating scheduled sync as operational.</li></ol><p>PDF and PPTX import directly; Google Docs export to PDF and Slides to PPTX. Stored files are limited to 20 MB; Google exports have a 10 MB limit. Other formats, including Sheets, DOCX, legacy PPT and recordings, appear as unsupported.</p><p>Empty text and visuals require review; OCR, automatic diagram interpretation, LMS marks import, and AI processing are not enabled by this connector.</p></section></aside></div>
  </div>;
}

function MappingForm({connection,courses,disabled,save}:{connection?:DriveConnectionStatus;courses:Course[];disabled:boolean;save:(body:{label:string;mappings:FolderMappingInput[]})=>Promise<void>}) {
  const [label,setLabel]=useState(connection?.label ?? '');
  const [mappings,setMappings]=useState<FolderMappingInput[]>(connection?.mappings.filter(m=>m.mode!=='submissions').map(m=>({...m,driveFolderId:folderLink(m),resourceKey:undefined})) ?? [newMapping()]);
  function update(index:number,changes:Partial<FolderMappingInput>){setMappings(values=>values.map((value,i)=>i===index?{...value,...changes}:value));}
  return <form onSubmit={event=>{event.preventDefault();void save({label,mappings});}}><label className="field"><span>Source account label</span><input required maxLength={100} value={label} onChange={event=>setLabel(event.target.value)} placeholder="Personal Drive"/></label>{mappings.map((mapping,index)=><fieldset className="drive-mapping" key={index}><legend>Root {index+1}</legend><label className="field"><span>Google Drive folder link or ID</span><input required value={mapping.driveFolderId} onChange={event=>update(index,{driveFolderId:event.target.value})} placeholder="https://drive.google.com/drive/folders/…"/></label><label className="field"><span>Folder structure</span><select value={mapping.mode} onChange={event=>update(index,{mode:event.target.value as 'course'|'collection',courseId:null})}><option value="course">One course folder</option><option value="collection">Collection with course subfolders</option></select></label><label className="field"><span>{mapping.mode==='collection'?'Course title for files directly in this root':'Course title'}</span><input required maxLength={300} value={mapping.rootCourseTitle} onChange={event=>update(index,{rootCourseTitle:event.target.value})}/></label>{mapping.mode==='course' && <label className="field"><span>Link to existing course</span><select value={mapping.courseId ?? ''} onChange={event=>update(index,{courseId:event.target.value || null})}><option value="">Create course from title</option>{courses.map(course=><option value={course.id} key={course.id}>{course.title}</option>)}</select></label>}{mapping.mode==='collection' && <p className="scope-note">Immediate subfolders become courses. Files directly in the root use the explicit title above; nested folders stay in their parent course.</p>}{mappings.length>1 && <button type="button" className="button" disabled={disabled} onClick={()=>setMappings(values=>values.filter((_,i)=>i!==index))}>Remove root {index+1}</button>}</fieldset>)}<div className="drive-actions">{mappings.length<20 && <button type="button" className="button" disabled={disabled} onClick={()=>setMappings(values=>[...values,newMapping()])}>Add folder</button>}<button className="button button-primary" type="submit" disabled={disabled}>{disabled?'Saving…':connection?'Save settings':'Create connector and installer'}</button></div></form>;
}
