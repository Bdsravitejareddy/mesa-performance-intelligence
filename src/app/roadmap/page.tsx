import { AppShell } from "@/components/app-shell";
import { RoadmapPlan, RoadmapRecommendations } from "@/components/roadmap";
import { loadRoadmap } from "@/lib/roadmap/load";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { cachedRead } from "@/lib/data/cached";

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const data = demoMode || !hasSupabaseConfig() ? null : await cachedRead("roadmap", loadRoadmap);
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Development roadmap</div><h1>Growth roadmap</h1><p className="page-subtitle">What to do next, ranked by a formula you can see: importance × demonstrated gap × confidence.</p></div></div>
    {data && <div className="info-callout"><span>Ranked against your targets: <b>Stage 1</b> {data.stages.primary}; <b>Stage 2</b> {data.stages.cross}. Requirements come from real job postings (see Career readiness).</span></div>}
    <div className="section-two-column"><section className="content-panel"><h2>Recommended next <span className="panel-count">{data?.recommendations.length ?? 0}</span></h2>{data ? <>
      {[["primary", `Stage 1 · ${data.stages.primary}`], ["cross", "Stage 2 · Cross-compatible roles"], ["course", "From your courses"]].map(([stage, label]) => { const items = data.recommendations.filter((item) => item.stage === stage); return items.length ? <div key={stage}><h3 className="role-stage">{label}</h3><RoadmapRecommendations items={items} /></div> : null; })}
      {!data.recommendations.length && <RoadmapRecommendations items={[]} />}
    </> : <p className="empty-hint">Connect Supabase to build a roadmap.</p>}</section>
      <aside className="content-panel"><h2>My plan <span className="panel-count">{data?.plan.length ?? 0}</span></h2>{data && <RoadmapPlan items={data.plan.map((item) => ({ id: item.id as string, competency: item.competency as string, activity: item.activity as string, rationale: item.rationale as string, effort_hours: Number(item.effort_hours), status: item.status as string, start_state: item.start_state as string, currentState: item.currentState, outcome: (item.outcome as string) ?? null, created_at: item.created_at as string, completed_at: (item.completed_at as string) ?? null }))} />}<p className="scope-note">Outcomes compare the competency before and after, using only evidence recorded after you started. A change may reflect new information rather than skill growth.</p></aside></div>
  </div></AppShell>;
}
