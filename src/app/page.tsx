import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard-view";
import { getDashboardSnapshot } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  let data;
  try {
    data = await getDashboardSnapshot();
  } catch {
    return <AppShell demoMode={demoMode}><div className="setup-inline"><span className="eyebrow">WORKSPACE CONNECTION</span><h1>Connect your private workspace</h1><p>We couldn’t load the Supabase workspace. Apply the included migration and confirm your project environment variables.</p><a href="/setup" className="button button-primary">Open setup guide</a></div></AppShell>;
  }
  return <AppShell demoMode={data.demoMode}><DashboardView data={data} /></AppShell>;
}
