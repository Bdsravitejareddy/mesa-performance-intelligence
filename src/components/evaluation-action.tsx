"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Sparkles } from "lucide-react";

type Evidence = { layer: string; criterion: string; finding: string; submission_quote: string; confidence: string; material_references?: { reference_label?: string } | { reference_label?: string }[] | null };
type ReportDetails = { reconciliation?: { criterion: string; officialEvidence: string; analysis: string; confidence: string }[]; arithmeticChecks?: { expression: string; computed: number | null; reported: number; status: string }[] };
type Report = { id: string; mesa_academic_score: number | null; analytical_score: number | null; professional_score: number | null; status: string; report: ReportDetails; evidence: Evidence[] };

export function EvaluationAction({ submissionId, enabled, reports, roleProfiles }: { submissionId: string; enabled: boolean; reports: Report[]; roleProfiles: { id: string; title: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [roleProfileId, setRoleProfileId] = useState("");
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
  return <div className="evaluation-box"><div className="evaluation-box-head"><strong>Independent evaluations</strong></div>{roleProfiles.length > 0 && <label className="field role-selector"><span>Professional role <small>(optional)</small></span><select value={roleProfileId} onChange={(event) => setRoleProfileId(event.target.value)}><option value="">No role selected</option>{roleProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.title}</option>)}</select></label>}{enabled ? <button className="button button-light" type="button" onClick={evaluate} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />} Evaluate this submission</button> : <span className="not-configured">AI disabled</span>}{!enabled && <p className="scope-note">Configure a provider and explicitly approve excerpt processing to request an evaluation. Nothing is sent now.</p>}{!roleProfiles.length && <p className="scope-note">Professional score will remain blank until a role profile is selected. Role benchmarks must be user supplied.</p>}{error && <p className="form-error">{error}</p>}{reports.map((report) => <article className="evaluation-report" key={report.id}><div className="three-layer-grid"><Score label="Mesa academic" value={report.mesa_academic_score} /><Score label="Analytical" value={report.analytical_score} /><Score label="Professional" value={report.professional_score} /></div><small className="evaluation-status">{report.status.replaceAll("_", " ")} · scores are independent and not averaged</small>{report.evidence.slice(0, 8).map((item, index) => { const materialReference = Array.isArray(item.material_references) ? item.material_references[0] : item.material_references; return <div className="evaluation-evidence" key={`${item.criterion}-${index}`}><strong>{item.criterion} <small>{item.layer.replaceAll("_", " ")}</small></strong><p>{item.finding}</p>{item.submission_quote && <q>{item.submission_quote}</q>}{materialReference?.reference_label && <small className="evidence-reference">{materialReference.reference_label}</small>}</div>; })}{(report.report.arithmeticChecks?.length ?? 0) > 0 && <div className="evaluation-extra"><strong>Deterministic arithmetic checks</strong>{report.report.arithmeticChecks?.map((check, index) => <small key={`${check.expression}-${index}`}>{check.expression} = {check.computed ?? "unverified"} · reported {check.reported} · {check.status.replaceAll("_", " ")}</small>)}</div>}{(report.report.reconciliation?.length ?? 0) > 0 && <div className="evaluation-extra"><strong>Official mark and feedback comparison</strong>{report.report.reconciliation?.map((item, index) => <small key={`${item.criterion}-${index}`}><b>{item.criterion}:</b> {item.analysis} <i>({item.confidence})</i></small>)}</div>}</article>)}</div>;
}

function Score({ label, value }: { label: string; value: number | null }) {
  return <div className="career-score"><span>{label}</span><strong>{value === null ? "—" : `${Number(value).toFixed(1)}/100`}</strong><small>{value === null ? "Insufficient role evidence" : "Separate evaluation"}</small></div>;
}
