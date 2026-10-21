"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Search, ExternalLink } from "lucide-react";

type DiscoveryHit = { title: string; url: string; snippet: string; reportedDate: string | null; evidence: "discovery-only"; verified: false };
type RetrievedSource = { title: string; text: string; canonicalUrl: string; pageDate: string | null; retrievedAt: string; contentHash: string; verified: false };
const TARGET_ROLE = "Senior Technical Product Manager — HealthTech/Healthcare — Singapore";

async function postRole(body: Record<string, unknown>) {
  const response = await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as { error?: string; results?: DiscoveryHit[]; source?: RetrievedSource; id?: string };
  if (!response.ok) throw new Error(result.error ?? "Could not complete this role action.");
  return result;
}

export function RoleProfileForm() {
  const router = useRouter();
  const [title, setTitle] = useState(TARGET_ROLE);
  const [employer, setEmployer] = useState("");
  const [industry, setIndustry] = useState("HealthTech / healthcare — Singapore");
  const [sourceUrl, setSourceUrl] = useState("");
  const [postingDate, setPostingDate] = useState("");
  const [requirements, setRequirements] = useState("");
  const [evidenceKind, setEvidenceKind] = useState<"responsibility" | "required" | "preferred">("required");
  const [reviewed, setReviewed] = useState(false);
  const [source, setSource] = useState<RetrievedSource | null>(null);
  const [hits, setHits] = useState<DiscoveryHit[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function discover() {
    setBusy(true); setError(""); setMessage(""); setHits([]);
    try {
      const result = await postRole({ action: "discover", roleTitle: title.replace(/[—–]/g, " ").replace(/\s+/g, " ").trim(), location: "Singapore" });
      setHits(result.results ?? []);
      if (!result.results?.length) setMessage("No permitted public role pages were found. You can still add a source URL and requirements you reviewed yourself.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Public role search is unavailable."); }
    finally { setBusy(false); }
  }

  async function fetchSource(url: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await postRole({ action: "fetch", sourceUrl: url });
      if (!result.source) throw new Error("No source text was returned for review.");
      setSource(result.source); setSourceUrl(result.source.canonicalUrl); setHits([]); setReviewed(false);
      if (!postingDate && result.source.pageDate) setPostingDate(result.source.pageDate.slice(0, 10));
      setMessage("Source text retrieved. Review it and enter exact requirement quotes before saving.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not retrieve that public page."); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const parsed = requirements.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({ title: line.slice(0, 160), description: line, sourceQuote: source ? line : "", evidenceKind }));
    try {
      await postRole({ action: "save", title, employer, industry, sourceUrl: sourceUrl || null, postingDate: postingDate || null, requirements: parsed, reviewed });
      setMessage("Role profile saved. It will be used as a benchmark only when its source, employer, and posting date are verified.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this profile."); }
    finally { setBusy(false); }
  }

  return <div className="role-benchmark-editor">
    <div className="role-discovery-controls">
      <label className="field"><span>Role title</span><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} /></label>
      <button type="button" className="button button-secondary" onClick={discover} disabled={busy || !title.trim()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Search size={14} />} Find public roles</button>
      <p className="scope-note">Search sends only this role title and the location Singapore. LinkedIn results are not imported. Search snippets are discovery hints, never evidence.</p>
    </div>
    {hits.length > 0 && <div className="role-discovery-results"><h3>Public results to review</h3>{hits.map((hit) => <article className="quality-finding" key={hit.url}><div><strong>{hit.title}</strong><p>{hit.snippet}</p><small>Search result only · {hit.reportedDate ? `reported ${hit.reportedDate}` : "date not verified"}</small></div><button type="button" className="button button-secondary" disabled={busy} onClick={() => void fetchSource(hit.url)}>Review source <ExternalLink size={13} /></button></article>)}</div>}
    <form onSubmit={submit}>
      <label className="field"><span>Employer</span><input value={employer} onChange={(event) => setEmployer(event.target.value)} maxLength={160} placeholder="Company name" /></label>
      <label className="field"><span>Industry and location</span><input value={industry} onChange={(event) => setIndustry(event.target.value)} maxLength={120} /></label>
      <label className="field"><span>Role source URL</span><input type="url" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setSource(null); setReviewed(false); }} placeholder="https://company.example/careers/role" /></label>
      {!source && <button type="button" className="button button-secondary" disabled={busy || !sourceUrl} onClick={() => void fetchSource(sourceUrl)}>Review fetched role source</button>}
      <label className="field"><span>Posting date</span><input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} /></label>
      {source && <div className="role-source-review"><div><strong>Retrieved source · not yet verified</strong><small>{source.canonicalUrl} · Retrieved {new Date(source.retrievedAt).toLocaleString()}</small></div><p>{source.text}</p></div>}
      <label className="field"><span>Requirement type for the lines below</span><select value={evidenceKind} onChange={(event) => setEvidenceKind(event.target.value as typeof evidenceKind)}><option value="required">Required qualification</option><option value="preferred">Preferred qualification</option><option value="responsibility">Responsibility</option></select></label>
      <label className="field"><span>{source ? "Exact source quote for each requirement (one per line)" : "Requirements you reviewed (one per line)"}</span><textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} required rows={5} placeholder={source ? "Paste exact requirement wording from the fetched source" : "Enter requirements from a role description you reviewed"} /></label>
      <label className="field role-review-confirm"><span><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> {source ? "I reviewed the fetched role source and confirm these lines represent its requirements." : "I reviewed this role description and confirm these requirements."}</span></label>
      {!source && <p className="scope-note">Unverified profiles are not used as benchmarks. Add an approved source page and posting date to enable evidence-based comparison.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="scope-note" role="status">{message}</p>}
      <button className="button button-primary" disabled={busy || !reviewed}>{busy ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Save reviewed role profile</button>
    </form>
  </div>;
}
