"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { EvaluationSummary, type EvaluationSummaryData, type SummaryReference } from "./evaluation-summary";

type ConsentStatus = { configured: boolean; consented: boolean; providerHost: string | null; model: string | null; retentionNotice: string | null; disclosureVersion: string | null };
type SummaryResponse = { summary: EvaluationSummaryData; sources: SummaryReference[]; sampleCounts: { marks?: number; feedback?: number; evaluations?: number } };

export function InsightSummary({ demoMode }: { demoMode: boolean }) {
  const [consent, setConsent] = useState<ConsentStatus | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    void fetch("/api/ai-consent", { cache: "no-store" }).then(async (response) => {
      const value = await response.json() as ConsentStatus;
      if (!response.ok) throw new Error("AI processing readiness could not be checked. Sign in and verify the workspace connection.");
      if (active) setConsent(value);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "AI processing readiness could not be checked."); });
    return () => { active = false; };
  }, [demoMode]);

  async function acceptConsent() {
    if (!consent?.disclosureVersion) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ai-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agree: true, disclosureVersion: consent.disclosureVersion }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "AI consent could not be saved.");
      setConsent({ ...consent, consented: true });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "AI consent could not be saved."); }
    finally { setBusy(false); }
  }

  async function generate(refresh: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/insights/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh }) });
      const result = await response.json() as SummaryResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Workspace summary could not be created.");
      setSummary(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Workspace summary could not be created."); }
    finally { setBusy(false); }
  }

  return <section className="panel insight-summary-panel" aria-labelledby="workspace-summary-title">
    <div className="panel-heading"><div><h2 id="workspace-summary-title">Your performance, with context</h2><p>Strengths, improvement priorities, and next actions grounded in saved marks and evaluations.</p></div><span className="sparkle-badge"><Sparkles size={15} /></span></div>
    {demoMode ? <p className="summary-empty">Preview mode uses illustrative scores only. Connect the private workspace to build an evidence-linked summary.</p> : consent === null ? <p className="summary-empty">Checking AI provider readiness and your current consent…</p> : !consent.configured ? <div className="summary-state"><strong>AI summaries are not configured.</strong><p>Set the server-side provider, processing gate, and retention disclosure before requesting summaries.</p></div> : !consent.consented ? <div className="summary-state"><strong>Review AI processing</strong><p>Provider: {consent.providerHost} · model: {consent.model}. Your saved work and linked course excerpts may be sent to this provider when you request an evaluation or summary.</p>{consent.retentionNotice && <p>{consent.retentionNotice}</p>}<label><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> I reviewed the processing and retention disclosure.</label><button className="button button-light" type="button" onClick={() => void acceptConsent()} disabled={!agreed || busy || !consent.disclosureVersion}>{busy ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />} Accept and enable AI summaries</button></div> : <>
      <p className="summary-provider">Current provider: {consent.providerHost} · {consent.model} · consent is current</p>
      {summary ? <><p className="summary-counts">Evidence used: {summary.sampleCounts.marks ?? 0} official marks · {summary.sampleCounts.feedback ?? 0} feedback records · {summary.sampleCounts.evaluations ?? 0} saved evaluations. Repeated patterns are separated from one-assessment observations.</p><EvaluationSummary submissionId="workspace" summary={summary.summary} sourceReferences={summary.sources} sampleCount={summary.sampleCounts.evaluations ?? 0} sampleLabel={`${summary.sampleCounts.evaluations ?? 0} saved evaluation reports`} documents={[]} /></> : <p className="summary-empty">No workspace summary has been generated yet. The summary will use saved evidence only and mark unsupported areas as insufficient.</p>}
      <button className="button button-light" aria-label="Generate or refresh summary" type="button" onClick={() => void generate(Boolean(summary))} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : summary ? <RefreshCw size={14} /> : <Sparkles size={14} />}{busy ? "Building evidence summary…" : summary ? "Refresh summary" : "Generate summary"}</button>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
