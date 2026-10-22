import { AppShell } from '@/components/app-shell';
import { DriveSyncPanel } from '@/components/drive-sync-panel';
import { DevicePairing } from '@/components/device-pairing';
import { isConfigured, listConnections } from '@/app/api/drive-sync/connections/management';
import { requireWorkspaceMember } from '@/lib/drive-sync/auth';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig, isDemoMode } from '@/lib/supabase/config';
export const dynamic='force-dynamic';
export default async function DriveSyncPage() {
  const demoMode=isDemoMode(),configured=isConfigured();
  if(!demoMode && hasSupabaseConfig())await requireWorkspaceMember();
  const connections=configured?await listConnections():[];
  const client=configured?await createClient():null;
  const courseResult=client?await client.from('courses').select('id,title').order('title'):null;
  if(courseResult?.error)throw new Error('Unable to load workspace courses.');
  return <AppShell demoMode={demoMode}><div className="section-page"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> SELECTED COURSE FOLDERS</div><h1>Drive sync</h1><p className="page-subtitle">Connect source Google accounts once, import course material automatically, and review progress in this shared workspace.</p></div></div>{configured && connections.length > 0 && <DevicePairing connections={connections.map((connection)=>({id:connection.id,label:connection.label}))}/>}<DriveSyncPanel connections={connections} courses={courseResult?.data ?? []} configured={configured}/></div></AppShell>;
}
