import { AppShell } from "@/components/app-shell";
import { AIConsentGate } from "@/components/ai-consent-gate";
import { ConversationImport, RunBehaviourAnalysis } from "@/components/thinking";
import type { DimensionAnalysis } from "@/lib/behaviour/analyse";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedRead } from "@/lib/data/cached";

export const dynamic = "force-dynamic";
type Stored = Omit<DimensionAnalysis, "observations"> & { observations: (DimensionAnalysis["observations"][number] & { label?: string })[] };

export default async function ThinkingPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const data = demoMode || !hasSupabaseConfig() ? null : await load();
  const latest = data?.analyses[0];
  const dimensions = (latest?.dimensions ?? []) as Stored[];
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Behavioural & thinking intelligence</div><h1>Thinking & behaviour</h1><p className="page-subtitle">How you approach problems, as tentative hypotheses tied to specific evidence — never personality traits, IQ or diagnoses.</p></div></div>
    {data ? <AIConsentGate purpose="This analysis reads your feedback, evaluations and optional conversation imports with Gemini."><RunBehaviourAnalysis hasConversations={data.imports.length > 0} /></AIConsentGate> : <p className="empty-hint">Connect Supabase first.</p>}
    {latest && <p className="scope-note">Latest analysis {new Date(latest.created_at as string).toLocaleString()} · {latest.provider_model as string} · sources: {Object.entries(latest.source_counts as Record<string, number>).map(([kind, count]) => `${count} ${kind.replaceAll("_", " ")}`).join(", ") || "none"} · {data!.analyses.length} run{data!.analyses.length === 1 ? "" : "s"} kept</p>}
    {dimensions.length > 0 && <div className="behaviour-grid">{dimensions.map((item) => <article key={item.dimension} className={`content-panel behaviour-card behaviour-${item.status}`}>
      <header><h2>{item.dimension}</h2><span className={`competency-state ${item.status === "observed" ? "state-emerging" : ""}`}>{item.status === "observed" ? `${item.evidenceStrength} evidence` : "Not observed"}</span></header>
      {item.status === "observed" ? <>
        <p><b>Observed:</b> {item.observedBehaviour}</p>
        <ul className="competency-evidence">{item.observations.map((observation) => <li key={`${observation.sourceId}-${observation.quote}`}><q>{observation.quote}</q><small>{observation.label || observation.sourceId}</small></li>)}</ul>
        {item.possibleExplanations.length > 0 && <><h3>Possible explanations</h3><ul>{item.possibleExplanations.map((explanation) => <li key={explanation}>{explanation}</li>)}</ul></>}
        {item.context && <p><b>Context:</b> {item.context}</p>}
        {item.consequences && <p><b>Demonstrated consequence:</b> {item.consequences}</p>}
        {item.counterevidence && <p><b>Counterevidence:</b> {item.counterevidence}</p>}
        {item.hypothesis && <p className="behaviour-hypothesis"><b>Hypothesis:</b> {item.hypothesis}</p>}
        {(item.wouldConfirm || item.wouldChallenge) && <p className="behaviour-test">{item.wouldConfirm && <><b>Would confirm:</b> {item.wouldConfirm} </>}{item.wouldChallenge && <><b>Would challenge:</b> {item.wouldChallenge}</>}</p>}
      </> : <p className="empty-hint">No source shows this yet. That is missing evidence, not a weakness.</p>}
    </article>)}</div>}
    {data && <section className="content-panel"><h2>AI conversation imports (optional) <span className="panel-count">{data.imports.length}</span></h2><p className="empty-hint">Import exports from ChatGPT, Claude or Gemini to give the analysis examples of your reasoning. Only your own messages are kept — an assistant&apos;s opinion is never treated as evidence. Conversations are visible only to your account and can be deleted at any time.</p><ConversationImport imports={data.imports} /></section>}
  </div></AppShell>;
}

async function load() {
  return cachedRead("thinking:load", loadWith);
}

async function loadWith(supabase: SupabaseClient) {
  const [analyses, imports] = await Promise.all([
    supabase.from("behaviour_analyses").select("id, dimensions, source_counts, provider_model, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("conversation_imports").select("id, title, source, message_count, conversation_count, created_at").order("created_at", { ascending: false }),
  ]);
  if (analyses.error || imports.error) throw new Error("Could not load the analysis. Check that the migration is applied.");
  return { analyses: analyses.data ?? [], imports: (imports.data ?? []) as { id: string; title: string; source: string; message_count: number; conversation_count: number; created_at: string }[] };
}
