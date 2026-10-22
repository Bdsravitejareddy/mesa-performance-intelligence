"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AIConsentGate } from "@/components/ai-consent-gate";

type Option = { id: string; label: string };
type Dimension = { name: string; score: number | null; evidence: string; evidenceVerified: boolean; strength: string; issue: string; improvement: string; exampleRevision: string };
type Report = { overall: number | null; dimensions: Dimension[]; strengths: string[]; issues: string[]; missingRequirements: string[]; summary: string; confidence: string; label: string };
type Result = { id: string; standard: { source: string; label: string }; blind: Report; contextual: { notes: string[]; priorities: string[]; contextUsed: string[] } | null; previous: { overall: number | null; sameStandard: boolean; report: Report } | null };

const WORK_KINDS = [["written_answer", "Written answer"], ["case_solution", "Case solution"], ["presentation", "Presentation"], ["proposal", "Business proposal"], ["project", "Project description"], ["resume", "Resume"], ["interview_response", "Interview response"], ["other", "Other"]] as const;

export function QualityChecker({ assessments, roles, documents }: { assessments: Option[]; roles: Option[]; documents: Option[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<"paste" | "document">("paste");
  const [work, setWork] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [workKind, setWorkKind] = useState("written_answer");
  const [mode, setMode] = useState<"criteria" | "role">("criteria");
  const [assessmentId, setAssessmentId] = useState("");
  const [criteriaText, setCriteriaText] = useState("");
  const [roleProfileId, setRoleProfileId] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [withContext, setWithContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/quality-checks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, work: source === "paste" ? work : undefined, submissionDocumentId: source === "document" ? documentId : undefined, workKind, mode, assessmentId: mode === "criteria" && !criteriaText.trim() ? assessmentId : undefined, criteriaText: mode === "criteria" ? criteriaText : undefined, roleProfileId: mode === "role" ? roleProfileId || undefined : undefined, roleTitle: mode === "role" && !roleProfileId ? roleTitle : undefined, withContext }) });
      const value = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(value.error ?? "Evaluation failed.");
      setResult(value);
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Evaluation failed."); }
    finally { setBusy(false); }
  }

  return <AIConsentGate purpose="The Quality Checker evaluates work you choose with Gemini.">
    <form className="quality-form" onSubmit={run}>
      <label className="field"><span>Title (re-use it to compare drafts)</span><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} placeholder="e.g. Zepto case — final draft" /></label>
      <div className="segmented" role="radiogroup" aria-label="Source of the work"><button type="button" className={source === "paste" ? "active" : ""} onClick={() => setSource("paste")}>Paste text</button><button type="button" className={source === "document" ? "active" : ""} onClick={() => setSource("document")} disabled={!documents.length}>Attached submission{documents.length ? ` (${documents.length})` : ""}</button></div>
      {source === "paste" ? <label className="field"><span>Work to evaluate</span><textarea rows={10} value={work} onChange={(event) => setWork(event.target.value)} placeholder="Paste the answer, proposal, resume or presentation text…" /></label> : <label className="field"><span>Submission document</span><select value={documentId} onChange={(event) => setDocumentId(event.target.value)} required><option value="">Choose a document</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <div className="form-row"><label className="field"><span>Type of work</span><select value={workKind} onChange={(event) => setWorkKind(event.target.value)}>{WORK_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>Evaluate against</span><select value={mode} onChange={(event) => setMode(event.target.value as "criteria" | "role")}><option value="criteria">Mode A — assessment criteria</option><option value="role">Mode B — target role expectations</option></select></label></div>
      {mode === "criteria" ? <div className="form-row"><label className="field"><span>Assessment (official rubric used first)</span><select value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)}><option value="">Choose an assessment</option>{assessments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="field"><span>Or your own criteria, one per line</span><textarea rows={3} value={criteriaText} onChange={(event) => setCriteriaText(event.target.value)} placeholder={"States assumptions\nSizes the market\nGives a recommendation"} /></label></div>
        : <div className="form-row"><label className="field"><span>Saved target role</span><select value={roleProfileId} onChange={(event) => setRoleProfileId(event.target.value)}><option value="">None — use a role title</option>{roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {!roleProfileId && <label className="field"><span>Role title</span><input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} placeholder="e.g. Technical Product Manager" /></label>}</div>}
      <label className="tagger-option"><input type="checkbox" checked={withContext} onChange={(event) => setWithContext(event.target.checked)} /> After the blind evaluation, add a separate contextual pass (official mark and feedback, previous check). It never changes the blind scores.</label>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Evaluating blind…" : "Run independent evaluation"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
    {result && <QualityReport result={result} />}
  </AIConsentGate>;
}

function QualityReport({ result }: { result: Result }) {
  const { blind, contextual, previous } = result;
  return <div className="quality-report">
    <div className="quality-head"><div><span className="eyebrow"><span className="eyebrow-line" /> Blind evaluation</span><strong className="quality-score">{blind.overall === null ? "Not scored" : `${blind.overall}/100`}</strong></div><small>{blind.label}<br />Standard: {result.standard.label} · {blind.confidence} confidence</small></div>
    {blind.summary && <p>{blind.summary}</p>}
    {previous && <p className="info-callout"><span>Previous check of this title: {previous.overall === null ? "not scored" : `${previous.overall}/100`}. {previous.sameStandard ? "Same standard — model scores vary between runs; differences under about one point per criterion are noise." : "Different standard — scores are not directly comparable."}</span></p>}
    <div className="quality-dimensions">{blind.dimensions.map((dimension) => <article key={dimension.name} className="quality-dimension">
      <header><strong>{dimension.name}</strong><span>{dimension.score === null ? "Not judgeable" : `${dimension.score}/10`}</span></header>
      {dimension.evidence && <q className={dimension.evidenceVerified ? "" : "unverified"}>{dimension.evidence}{!dimension.evidenceVerified && " — quote not found in the work"}</q>}
      {dimension.strength && <p><b>Strength:</b> {dimension.strength}</p>}
      {dimension.issue && <p><b>Issue:</b> {dimension.issue}</p>}
      {dimension.improvement && <p><b>Improve:</b> {dimension.improvement}</p>}
      {dimension.exampleRevision && <p className="quality-example"><b>Illustrative revision:</b> {dimension.exampleRevision}</p>}
    </article>)}</div>
    {blind.missingRequirements.length > 0 && <><h3>Missing requirements</h3><ul>{blind.missingRequirements.map((item) => <li key={item}>{item}</li>)}</ul></>}
    {contextual && <div className="quality-context"><span className="eyebrow"><span className="eyebrow-line" /> Contextual assessment · uses {contextual.contextUsed.join(", ") || "no extra context"}</span><ul>{[...contextual.notes, ...contextual.priorities].map((item) => <li key={item}>{item}</li>)}</ul></div>}
  </div>;
}

export function DeleteCheckButton({ id }: { id: string }) {
  const router = useRouter();
  return <button className="button button-secondary" type="button" onClick={async () => { if (!window.confirm("Delete this check? It will no longer be used as evidence.")) return; await fetch(`/api/quality-checks?id=${id}`, { method: "DELETE" }); router.refresh(); }}>Delete</button>;
}
