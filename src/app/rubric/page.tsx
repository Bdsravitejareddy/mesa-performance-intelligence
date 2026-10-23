import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { RubricForm } from "@/components/rubric-form";
import { cachedRead } from "@/lib/data/cached";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { DEFAULT_RUBRIC, loadRubric } from "@/lib/settings/rubric";

export const dynamic = "force-dynamic";

export default async function RubricPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const rubric = demoMode || !hasSupabaseConfig() ? DEFAULT_RUBRIC : await cachedRead("rubric:load", (client: SupabaseClient) => loadRubric(client));
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Your rubric</div><h1>Rubric & weights</h1><p className="page-subtitle">Every weight and benchmark the dashboard uses, in one place. Change them to match what matters to you; every page recalculates from these. <Link href="/methodology" className="text-link">How each figure is derived →</Link></p></div></div>
    <RubricForm initial={rubric} defaults={DEFAULT_RUBRIC} />
  </div></AppShell>;
}
