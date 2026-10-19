import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard-view";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  if (!demoMode && !hasSupabaseConfig()) {
    return <AppShell demoMode={false}><section className="setup-inline"><span className="eyebrow">DATA CONNECTION REQUIRED</span><h1>Connect your Mesa data</h1><p>The dashboard is deployed, but its Supabase connection is not configured. No Mesa courses, marks, or feedback have been imported.</p><p>Set the Supabase project URL and publishable key in Vercel, apply the database migration, and configure your owner sign-in. Redeploy after saving the environment variables.</p><p>LMS sync is not connected. Your Chrome sign-in does not automatically carry over to this dashboard.</p><Link href="/setup" className="button button-primary">Set up the data connection</Link></section></AppShell>;
  }
  let data;
  try {
    data = await getDashboardSnapshot();
  } catch {
    return <AppShell demoMode={demoMode}><div className="setup-inline"><span className="eyebrow">WORKSPACE CONNECTION</span><h1>Connect your private workspace</h1><p>We couldn’t load the Supabase workspace. Apply the included migration and confirm your project environment variables.</p><a href="/setup" className="button button-primary">Open setup guide</a></div></AppShell>;
  }
  return <AppShell demoMode={data.demoMode}><DashboardView data={data} /></AppShell>;
}
