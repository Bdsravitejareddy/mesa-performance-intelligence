import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard-view";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { cachedRead } from "@/lib/data/cached";
import { selectedTerm } from "@/lib/term";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import Link from "next/link";
import { workspaceSession } from "@/lib/data/cached";
import { createClient } from "@/lib/supabase/server";
import { loadGlance } from "@/lib/profile/glance";
import { onboardingSteps } from "@/lib/profile/onboarding";
import { after } from "next/server";
import { BRIEF_RULES_VERSION, generateOverviewBrief } from "@/lib/insights/overview-brief";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  if (!demoMode && !hasSupabaseConfig()) {
    return <AppShell demoMode={false}><section className="setup-inline"><span className="eyebrow">DATA CONNECTION REQUIRED</span><h1>Connect your Mesa data</h1><p>The dashboard is deployed, but its Supabase connection is not configured. No Mesa courses, marks, or feedback have been imported.</p><p>Set the Supabase project URL and publishable key in Vercel, apply the database migration, and configure your owner sign-in. Redeploy after saving the environment variables.</p><p>LMS sync is not connected. Your Chrome sign-in does not automatically carry over to this dashboard.</p><Link href="/setup" className="button button-primary">Set up the data connection</Link></section></AppShell>;
  }
  let data;
  try {
    data = process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? await getDashboardSnapshot() : await (async () => { const term = await selectedTerm(); return cachedRead(`overview:${term}`, (client) => getDashboardSnapshot(client, term)); })();
  } catch {
    return <AppShell demoMode={demoMode}><div className="setup-inline"><span className="eyebrow">WORKSPACE CONNECTION</span><h1>Connect your private workspace</h1><p>We couldn’t load the Supabase workspace. Apply the included migration and confirm your project environment variables.</p><a href="/setup" className="button button-primary">Open setup guide</a></div></AppShell>;
  }
  const glance = data.demoMode ? null : await cachedRead("tests:glance", loadGlance).catch(() => null);
  const steps = data.demoMode ? [] : await cachedRead("overview:steps", onboardingSteps).catch(() => []);
  // A summary written under earlier rules is replaced in the background on this visit.
  const stale = !data.demoMode && data.brief && data.brief.brief.rulesVersion !== BRIEF_RULES_VERSION;
  if (stale) after(async () => { try { const client = await createClient(); const { data: claims } = await client.auth.getClaims(); const userId = claims?.claims?.sub; if (typeof userId === "string") await generateOverviewBrief(client, userId, data.term); } catch { /* the next refresh writes it */ } });
  return <AppShell demoMode={data.demoMode}><DashboardView data={data} name={await firstName()} glance={glance} staleBrief={Boolean(stale)} steps={steps} /></AppShell>;
}

// The greeting uses the first part of the signed-in address (ravi_bussareddy@… → Ravi); nothing else is shown.
async function firstName() {
  try {
    if (!(await workspaceSession())) return "there";
    const { data } = await (await createClient()).auth.getClaims();
    const local = String(data?.claims?.email ?? "").split("@")[0].split(/[._\-+\d]/).find(Boolean) ?? "";
    return local ? local.charAt(0).toUpperCase() + local.slice(1).toLowerCase() : "there";
  } catch { return "there"; }
}
