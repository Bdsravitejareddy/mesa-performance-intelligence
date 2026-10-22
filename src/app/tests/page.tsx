import { AppShell } from "@/components/app-shell";
import { PersonalityQuestionnaire, ReasoningTest } from "@/components/self-tests";
import { FACTOR_LABELS, type Factor } from "@/lib/tests/personality";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TestsPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const attempts = demoMode || !hasSupabaseConfig() ? [] : await load();
  const reasoning = attempts.filter((row) => row.kind === "reasoning");
  const personality = attempts.find((row) => row.kind === "personality");
  const factors = personality?.result?.factors as Record<Factor, { score: number; band: string }> | undefined;
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Self-assessments</div><h1>Reasoning & personality</h1><p className="page-subtitle">Inputs that add evidence where coursework has none. Results are labelled as self-administered and kept separate from official marks.</p></div></div>
    <div className="section-two-column"><section className="content-panel"><h2>Reasoning test</h2><ReasoningTest />
      {reasoning.length > 0 && <><h3 className="role-stage">Your attempts</h3><ul className="test-history">{reasoning.map((row) => { const result = row.result as { correct: number; total: number; sections: Record<string, { correct: number; total: number }>; overtime?: boolean }; return <li key={row.id}><strong>{result.correct}/{result.total}</strong> <small>{new Date(row.submitted_at as string).toLocaleString()} · {Object.entries(result.sections).map(([section, value]) => `${section} ${value.correct}/${value.total}`).join(" · ")}{result.overtime ? " · over time" : ""}</small></li>; })}</ul></>}</section>
      <aside className="content-panel"><h2>Personality questionnaire</h2><p className="scope-note">Mini-IPIP (Donnellan et al., 2006), a public-domain 20-item Big Five measure. It describes self-reported preferences, not ability or potential, and never changes a competency classification. Scores are on the questionnaire&apos;s own 4–20 scale; no population comparison is made.</p><PersonalityQuestionnaire />
      {factors && <><h3 className="role-stage">Latest result · {new Date(personality!.submitted_at as string).toLocaleDateString()}</h3><div className="factor-list">{(Object.keys(FACTOR_LABELS) as Factor[]).map((factor) => <div key={factor} className="factor-row"><span>{FACTOR_LABELS[factor]}</span><span className="course-bar-track"><i className="bar-muted" style={{ width: `${((factors[factor].score - 4) / 16) * 100}%` }} /></span><b>{factors[factor].score}/20</b><small>{factors[factor].band} on the scale</small></div>)}</div></>}</aside></div>
  </div></AppShell>;
}

async function load() {
  const supabase = await createClient();
  const { data } = await supabase.from("test_attempts").select("id, kind, submitted_at, result").not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(20);
  return (data ?? []) as { id: string; kind: string; submitted_at: string; result: Record<string, unknown> }[];
}
