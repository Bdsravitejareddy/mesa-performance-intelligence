import { AppShell } from "@/components/app-shell";
import { Why } from "@/components/why";
import { AIConsentGate } from "@/components/ai-consent-gate";
import { ConversationImport, RunBehaviourAnalysis } from "@/components/thinking";
import { AiProfileImport, type SavedProfile } from "@/components/ai-profile-import";
import type { AiProfile } from "@/lib/behaviour/ai-profile";
import { DIMENSIONS, strengthFor, type DimensionAnalysis } from "@/lib/behaviour/analyse";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedRead } from "@/lib/data/cached";
import { ExpandCard } from "@/components/expand-card";
import { Cue } from "@/components/cue";

// The first sentence, kept short: the card is an overview and the full reading opens on click.
const headline = (text: string) => { const first = text.split(/(?<=[.!?])\s+/)[0] ?? text; return first.length > 200 ? `${first.slice(0, 197).trimEnd()}…` : first; };
// What would show each pattern, so an empty one says what it is waiting for.
const WOULD_SHOW: Record<string, string> = {
  "Framing the problem": "Work that defines the problem, its user and its assumptions before solving it.",
  "Reasoning from fundamentals": "Breaking a problem into its drivers (unit economics, causal chain) and testing an idea against them.",
  "Working with numbers": "Calculations and figures that are accurate, consistent and checked.",
  "Weighing evidence": "Dealing with data that cuts against your conclusion, or changing a view when evidence arrives.",
  "Making decisions": "A justified choice under incomplete data or limited time, with the trade-offs named.",
  "Explaining your thinking": "Writing that shows how your conclusion follows from the evidence.",
  "Learning from feedback": "A later piece of work that visibly acts on feedback a faculty member or reviewer gave on an earlier one.",
};

export const dynamic = "force-dynamic";
type Stored = Omit<DimensionAnalysis, "observations"> & { observations: (DimensionAnalysis["observations"][number] & { label?: string })[] };

export default async function ThinkingPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const data = demoMode || !hasSupabaseConfig() ? null : await load();
  const latest = data?.analyses[0];
  const dimensions = (latest?.dimensions ?? []) as Stored[];
  const current = dimensions.length > 0 && dimensions.every((item) => (DIMENSIONS as readonly string[]).includes(item.dimension));
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Behavioural & thinking intelligence</div><h1>Thinking & behaviour</h1><p className="page-subtitle">How you approach problems, as tentative hypotheses tied to specific evidence — never personality traits, IQ or diagnoses.</p></div></div>
    {data ? <AIConsentGate purpose="This analysis reads your feedback, evaluations and optional conversation imports with Gemini."><RunBehaviourAnalysis hasConversations={data.imports.length > 0} /></AIConsentGate> : <p className="empty-hint">Connect Supabase first.</p>}
    {latest && <p className="scope-note">Latest analysis {new Date(latest.created_at as string).toLocaleString()} · {latest.provider_model as string} · sources: {Object.entries(latest.source_counts as Record<string, number>).map(([kind, count]) => `${count} ${kind.replaceAll("_", " ")}`).join(", ") || "none"} · {data!.analyses.length} run{data!.analyses.length === 1 ? "" : "s"} kept</p>}
    {dimensions.length > 0 && !current && <p className="info-callout"><span>The patterns were renamed and simplified; this reading uses the earlier names until the next analysis runs (nightly, or with Run analysis above).</span></p>}
    {dimensions.length > 0 && <>
      <p className="evidence-key"><b>Evidence strength</b> counts the independent sources that show a pattern: <em>limited</em> = one, <em>moderate</em> = two, <em>substantial</em> = three or more. Your assistants&apos; profiles add context but never count towards it.</p>
      <div className="behaviour-grid">{dimensions.filter((item) => item.status === "observed").map((item) => {
        // Independent sources exclude assistant profiles (ids A1, A2…), which add context but never count.
        const independent = new Set(item.observations.map((observation) => observation.sourceId).filter((id) => !/^A\d+$/.test(id))).size;
        const profiles = new Set(item.observations.map((observation) => observation.sourceId).filter((id) => /^A\d+$/.test(id))).size;
        return <ExpandCard key={item.dimension} title={item.dimension} badge={<span className="competency-state state-emerging"><Cue label={`${strengthFor(independent)} evidence`} focusable={false} /></span>} summary={headline(item.overview || item.hypothesis || item.observedBehaviour)} meta={`${independent} independent source${independent === 1 ? "" : "s"}${profiles ? ` (+${profiles} assistant profile, not counted)` : ""}`}>
          <p className="behaviour-lead">{item.overview || item.observedBehaviour}</p>
          {item.why && <p className="behaviour-why"><b>Why we think this:</b> {item.why}</p>}
          <ul className="competency-evidence compact">{item.observations.slice(0, 2).map((observation) => <li key={`${observation.sourceId}-${observation.quote}`}><q>{observation.quote.length > 220 ? `${observation.quote.slice(0, 217)}…` : observation.quote}</q><small>{observation.label || observation.sourceId}</small></li>)}</ul>
          <Why label="In-depth reasoning">
            <p><b>What was observed:</b> {item.observedBehaviour}</p>
            {item.hypothesis && <p className="behaviour-hypothesis"><b>Working hypothesis:</b> {item.hypothesis}</p>}
            {item.observations.length > 2 && <><h3>All evidence</h3><ul className="competency-evidence">{item.observations.map((observation) => <li key={`all-${observation.sourceId}-${observation.quote}`}><q>{observation.quote}</q><small>{observation.label || observation.sourceId}</small></li>)}</ul></>}
            {item.possibleExplanations.length > 0 && <><h3>Other possible explanations</h3><ul>{item.possibleExplanations.map((explanation) => <li key={explanation}>{explanation}</li>)}</ul></>}
            {item.context && <p><b>Context:</b> {item.context}</p>}
            {item.consequences && <p><b>What it led to:</b> {item.consequences}</p>}
            {item.counterevidence && <p><b>Evidence the other way:</b> {item.counterevidence}</p>}
            {(item.wouldConfirm || item.wouldChallenge) && <p className="behaviour-test">{item.wouldConfirm && <><b>Would confirm:</b> {item.wouldConfirm} </>}{item.wouldChallenge && <><b>Would challenge:</b> {item.wouldChallenge}</>}</p>}
          </Why>
        </ExpandCard>;
      })}</div>
      {dimensions.some((item) => item.status !== "observed") && <section className="content-panel not-observed">
        <h2>Not observed yet <span className="panel-count">{dimensions.filter((item) => item.status !== "observed").length}</span></h2>
        <p className="empty-hint">No source shows these yet — missing evidence, not a weakness. Each fills in when a submission or piece of feedback shows it:</p>
        <ul>{dimensions.filter((item) => item.status !== "observed").map((item) => <li key={item.dimension}><strong><Cue label={item.dimension} /></strong><small>{WOULD_SHOW[item.dimension] ?? "Work or feedback that shows this directly."}</small></li>)}</ul>
      </section>}
    </>}
    {data && <section className="content-panel"><h2>Your AI assistants&apos; view of you <span className="panel-count">{data.profiles.length}</span></h2><p className="empty-hint">Give the profile prompt to each AI assistant you use (for example ChatGPT, Claude or Gemini), then paste the reply here. It is an assistant&apos;s opinion: the analysis uses it as context and as hypotheses to check, and a pattern still needs your own work or feedback to count as observed. Visible only to your account.</p><AiProfileImport saved={data.profiles} /></section>}
    {data && <section className="content-panel"><h2>AI conversation imports (optional) <span className="panel-count">{data.imports.length}</span></h2><p className="empty-hint">Import exports from ChatGPT, Claude or Gemini to give the analysis examples of your reasoning. Only your own messages are kept — an assistant&apos;s opinion is never treated as evidence. Conversations are visible only to your account and can be deleted at any time.</p><ConversationImport imports={data.imports} /></section>}
  </div></AppShell>;
}

async function load() {
  return cachedRead("thinking:load", loadWith);
}

async function loadWith(supabase: SupabaseClient) {
  const [analyses, imports, profiles] = await Promise.all([
    supabase.from("behaviour_analyses").select("id, dimensions, source_counts, provider_model, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("conversation_imports").select("id, title, source, message_count, conversation_count, created_at").order("created_at", { ascending: false }),
    supabase.from("ai_context_reports").select("id, source, report, created_at").order("created_at", { ascending: false }),
  ]);
  if (analyses.error || imports.error) throw new Error("Could not load the analysis. Check that the migration is applied.");
  const saved: SavedProfile[] = (profiles.data ?? []).map((row) => { const report = row.report as AiProfile; return { id: row.id as string, source: row.source as string, created_at: row.created_at as string, findings: report.findings?.length ?? 0, observed: (report.findings ?? []).filter((item) => item.tag === "Observed").length, changes: (report.changes ?? []).map((change) => ({ what: change.what, when: change.when })) }; });
  return { profiles: saved, analyses: analyses.data ?? [], imports: (imports.data ?? []) as { id: string; title: string; source: string; message_count: number; conversation_count: number; created_at: string }[] };
}
