import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { describeSyncHealth, type SyncRun } from "@/lib/lms/sync-health";
import { isProviderConfigured } from "@/lib/ai/settings";

export const dynamic = "force-dynamic";

// What a student needs to know about their connections: whether each source is working and how fresh it is, with
// the one action that fixes it. Deployment steps are for the workspace owner and live in docs/DEPLOYMENT.md.
export default async function SetupPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const connected = hasSupabaseConfig() && !demoMode;
  const supabase = connected ? await createClient() : null;
  const [runs, drive] = supabase ? await Promise.all([
    supabase.from("sync_runs").select("status, started_at, finished_at, message").eq("source_name", "Mesa Nexus MCP").order("started_at", { ascending: false }).limit(20),
    supabase.from("drive_sources").select("id", { count: "exact", head: true }),
  ]) : [{ data: [] }, { count: 0 }];
  const nexus = describeSyncHealth((runs.data ?? []) as SyncRun[]);
  const driveSources = drive.count ?? 0;
  const aiReady = isProviderConfigured();
  const rows = [
    { name: "Nexus (courses, marks, deadlines)", ok: nexus.level === "ok", state: nexus.level === "ok" ? "Working" : nexus.level === "never" ? "Not synced yet" : "Needs attention", detail: nexus.lastCompletedAt ? `Last complete sync ${new Date(nexus.lastCompletedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. ${nexus.notices[0] ?? ""}` : "It syncs once a day, around 08:30 India time.", fix: nexus.level === "ok" ? null : { href: "/marks", label: "See the sync message" } },
    { name: "Drive course folders", ok: driveSources > 0, state: driveSources > 0 ? `${driveSources} connected` : "Not connected", detail: driveSources > 0 ? "New and changed files are picked up automatically." : "Connect a course folder to grade your own work against course material.", fix: driveSources > 0 ? null : { href: "/drive-sync", label: "Connect a folder" } },
    { name: "AI grading and readings", ok: aiReady, state: aiReady ? "Available" : "Not set up", detail: aiReady ? "AI grades are shown beside official marks, never instead of them." : "AI grades and personality readings are switched off on this workspace.", fix: null },
  ];
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Setup & help</div><h1>Your connections</h1><p className="page-subtitle">Whether each source is working, how fresh it is, and what to do if it is not.</p></div></div>
    {demoMode && <p className="scope-note">This is a demonstration workspace, so connections are shown as examples.</p>}
    <section className="content-panel" aria-label="Connections">
      <ul className="setup-connections">{rows.map((row) => <li key={row.name} className="setup-step"><span className={`setup-step-icon${row.ok ? " done" : ""}`}>{row.ok ? <CheckCircle2 size={15} /> : <Circle size={15} />}</span><span><strong>{row.name} · {row.state}</strong><small>{row.detail}</small>{row.fix && <Link className="text-link" href={row.fix.href}>{row.fix.label}</Link>}</span></li>)}</ul>
    </section>
    <aside className="content-panel"><div className="helper-card setup-helper"><ShieldCheck size={19} /><h3>Your privacy</h3><p>Your records are visible only to you and the approved accounts sharing this workspace. Official marks and AI estimates are kept apart. Text goes to an AI provider only after you approve AI processing, and only the text needed for that reading.</p></div></aside>
  </div></AppShell>;
}
