"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { EvaluationSummary, type EvaluationDocument, type EvaluationSummaryData, type SummaryReference } from "./evaluation-summary";

type Evidence = { layer: string; criterion: string; finding: string; submission_quote: string; confidence: string; material_references?: { reference_label?: string } | { reference_label?: string }[] | null };
type ReportDetails = { summary?: EvaluationSummaryData; sourceReferences?: SummaryReference[]; reconciliation?: { criterion: string; officialEvidence: string; analysis: string; confidence: string }[]; arithmeticChecks?: { expression: string; computed: number | null; reported: number; status: string }[] };
type Report = { id: string; mesa_academic_score: number | null; analytical_score: number | null; professional_score: number | null; status: string; report: ReportDetails; evidence: Evidence[] };
type ConsentStatus = { configured: boolean; consented: boolean; providerHost: string | null; model: string | null; retentionNotice: string | null; disclosureVersion: string | null };

export function EvaluationAction({ submissionId, reports, roleProfiles, documents }: { submissionId: string; reports: Report[]; roleProfiles: { id: string; title: string }[]; documents: EvaluationDocument[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [roleProfileId, setRoleProfileId] = useState("");
  const [consent, setConsent] = useState<ConsentStatus | null>(null);
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/ai-consent", { cache: "no-store" }).then(async (response) => {
      const value = await response.json() as ConsentStatus;
      if (!response.ok) throw new Error("AI readiness and consent could not be checked.");
      if (active) setConsent(value);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "AI readiness and consent could not be checked."); });
    return () => { active = false; };
  }, []);
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
  async function evaluate() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/evaluations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId, roleProfileId: roleProfileId || undefined }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Evaluation could not be created.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Evaluation could not be created."); }
    finally { setBusy(false); }
  }
  const aiReady = consent?.configured === true && consent.consented === true;
  return <div className="evaluation-box"><div className="evaluation-box-head"><strong>Independent evaluations</strong></div>{roleProfiles.length > 0 && <label className="field role-selector"><span>Professional role <small>(optional)</small></span><select value={roleProfileId} onChange={(event) => setRoleProfileId(event.target.value)}><option value="">No role selected</option>{roleProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.title}</option>)}</select></label>}{consent === null ? <p className="scope-note">Checking AI provider readiness and current consent…</p> : !consent.configured ? <div className="summary-state"><strong>AI evaluation is not configured.</strong><p>Set the server-side provider, processing gate, and retention disclosure before requesting an evaluation.</p></div> : !consent.consented ? <div className="summary-state"><strong>Review AI processing</strong><p>Provider: {consent.providerHost} · model: {consent.model}. Submitted work and relevant course excerpts may be sent when you request evaluation.</p>{consent.retentionNotice && <p>{consent.retentionNotice}</p>}<label><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> I reviewed the processing and retention disclosure.</label><button className="button button-light" type="button" onClick={() => void acceptConsent()} disabled={!agreed || busy || !consent.disclosureVersion}>{busy ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />} Accept and enable evaluation</button></div> : <button className="button button-light" type="button" onClick={evaluate} disabled={!aiReady || busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />} Evaluate this submission</button>}{!roleProfiles.length && <p className="scope-note">Professional score will remain blank until a role profile is selected. Role benchmarks must be user supplied.</p>}{error && <p className="form-error">{error}</p>}{reports.map((report) => <article className="evaluation-report" key={report.id}><div className="three-layer-grid"><Score label="Mesa academic" value={report.mesa_academic_score} /><Score label="Analytical" value={report.analytical_score} /><Score label="Professional" value={report.professional_score} /></div><small className="evaluation-status">{report.status.replaceAll("_", " ")} · scores are independent and not averaged</small><EvaluationSummary submissionId={submissionId} summary={report.report.summary ?? null} sourceReferences={report.report.sourceReferences ?? []} sampleCount={1} documents={documents} />{report.evidence.slice(0, 8).map((item, index) => { const materialReference = Array.isArray(item.material_references) ? item.material_references[0] : item.material_references; return <div className="evaluation-evidence" key={`${item.criterion}-${index}`}><strong>{item.criterion} <small>{item.layer.replaceAll("_", " ")}</small></strong><p>{item.finding}</p>{item.submission_quote && <q>{item.submission_quote}</q>}{materialReference?.reference_label && <small className="evidence-reference">{materialReference.reference_label}</small>}</div>; })}{(report.report.arithmeticChecks?.length ?? 0) > 0 && <div className="evaluation-extra"><strong>Deterministic arithmetic checks</strong>{report.report.arithmeticChecks?.map((check, index) => <small key={`${check.expression}-${index}`}>{check.expression} = {check.computed ?? "unverified"} · reported {check.reported} · {check.status.replaceAll("_", " ")}</small>)}</div>}{(report.report.reconciliation?.length ?? 0) > 0 && <div className="evaluation-extra"><strong>Official mark and feedback comparison</strong>{report.report.reconciliation?.map((item, index) => <small key={`${item.criterion}-${index}`}><b>{item.criterion}:</b> {item.analysis} <i>({item.confidence})</i></small>)}</div>}</article>)}</div>;
}

function Score({ label, value }: { label: string; value: number | null }) {
  return <div className="career-score"><span>{label}</span><strong>{value === null ? "—" : `${Number(value).toFixed(1)}/100`}</strong><small>{value === null ? "Insufficient role evidence" : "Separate evaluation"}</small></div>;
}
