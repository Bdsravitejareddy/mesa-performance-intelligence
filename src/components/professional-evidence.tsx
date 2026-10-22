"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const KINDS = [["resume", "Resume"], ["project", "Project"], ["portfolio", "Portfolio"], ["work_experience", "Work experience"], ["certification", "Certification"], ["dashboard", "Dashboard"], ["repository", "Code repository"], ["presentation", "Presentation"], ["achievement", "Achievement"], ["other", "Other"]] as const;

export function ProfessionalEvidenceForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/professional-evidence", { method: "POST", body: new FormData(form) });
      const result = await response.json() as { error?: string; claimsExtracted?: number; note?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save.");
      setMessage(result.note || `Saved. ${result.claimsExtracted ?? 0} claim${result.claimsExtracted === 1 ? "" : "s"} extracted for review.`);
      form.reset();
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
    finally { setBusy(false); }
  }
  return <form className="quality-form" onSubmit={submit}>
    <div className="form-row"><label className="field"><span>Type</span><select name="kind" defaultValue="resume">{KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Title</span><input name="title" required maxLength={200} placeholder="e.g. Resume — October 2026" /></label></div>
    <label className="field"><span>File (PDF, Word or PowerPoint, up to 20 MB)</span><input name="file" type="file" accept=".pdf,.docx,.pptx" /></label>
    <div className="form-row"><label className="field"><span>Link (https://)</span><input name="url" type="url" placeholder="https://github.com/…" /></label><label className="field"><span>Issued by / organisation</span><input name="issuedBy" maxLength={200} /></label></div>
    <label className="field"><span>Description or measurable outcome</span><textarea name="description" rows={3} maxLength={4000} placeholder="What you built or did, and what changed because of it." /></label>
    <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving and extracting claims…" : "Add evidence"}</button>
    {message && <small role="status">{message}</small>}
  </form>;
}

type Claim = { id: string; claim: string; claim_type: string; quantified: boolean; competency: string | null; status: string; supporting: string | null; supporting_note: string };
type Item = { id: string; kind: string; title: string; description: string; url: string | null; issued_by: string; hasFile: boolean; created_at: string; claims: Claim[] };

export function ProfessionalEvidenceList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [support, setSupport] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  async function call(input: RequestInfo, init: RequestInit, key: string) {
    setBusy(key); setMessage("");
    try {
      const response = await fetch(input, init);
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Could not save.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
    finally { setBusy(""); }
  }
  const patch = (claimId: string, status: string, supportingEvidenceId?: string) => call("/api/professional-evidence", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimId, status, supportingEvidenceId }) }, claimId);
  if (!items.length) return <p className="empty-hint">No professional evidence yet. Add your resume to start; each claim stays unverified until another piece of evidence supports it.</p>;
  return <div className="evidence-items">{message && <p className="form-error" role="alert">{message}</p>}{items.map((item) => <article className="evidence-item" key={item.id}>
    <header><div><strong>{item.title}</strong><small>{item.kind.replaceAll("_", " ")}{item.issued_by ? ` · ${item.issued_by}` : ""} · added {new Date(item.created_at).toLocaleDateString()}{item.hasFile ? " · file stored privately" : ""}</small>{item.url && <a className="text-link" href={item.url} target="_blank" rel="noreferrer noopener">{item.url}</a>}</div>
      <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Delete “${item.title}”, its file and its claims?`)) void call(`/api/professional-evidence?id=${item.id}`, { method: "DELETE" }, item.id); }}>Delete</button></header>
    {item.description && <p>{item.description}</p>}
    {item.claims.length > 0 && <ul className="claim-list">{item.claims.map((claim) => <li key={claim.id} className={`claim-${claim.status}`}>
      <span><strong>{claim.claim}</strong><small>{claim.claim_type}{claim.quantified ? " · quantified" : ""}{claim.competency ? ` · ${claim.competency}` : " · no competency mapped"} · {claim.status === "supported" ? `supported by ${claim.supporting ?? "another item"}` : claim.status === "withdrawn" ? "withdrawn" : "claim, not yet supported"}</small></span>
      {claim.status === "claimed" ? <span className="claim-actions"><select aria-label="Supporting evidence" value={support[claim.id] ?? ""} onChange={(event) => setSupport((current) => ({ ...current, [claim.id]: event.target.value }))}><option value="">Supported by…</option>{items.filter((other) => other.id !== item.id).map((other) => <option key={other.id} value={other.id}>{other.title}</option>)}</select><button className="button button-secondary" type="button" disabled={!support[claim.id] || Boolean(busy)} onClick={() => void patch(claim.id, "supported", support[claim.id])}>Mark supported</button><button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void patch(claim.id, "withdrawn")}>Withdraw</button></span>
        : <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void patch(claim.id, "claimed")}>Reset</button>}
    </li>)}</ul>}
  </article>)}</div>;
}
