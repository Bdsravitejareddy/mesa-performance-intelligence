"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Sparkles } from "lucide-react";

type Rubric = { id: string; source_kind: string; approval_status: string; maximum_marks: number; rubric_criteria: { id: string; title: string; description: string; weight: number; maximum_marks: number; source_reference: string }[] };

export function RubricActions({ assessmentId, rubrics, officialMaterials = [], disabled = false }: { assessmentId: string; rubrics: Rubric[]; officialMaterials?: { id: string; name: string }[]; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function draft() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/rubrics/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId }) });
      const result = (await response.json()) as { error?: string; criteriaCount?: number };
      if (!response.ok) throw new Error(result.error ?? "Could not draft a rubric.");
      setMessage(`Inferred draft created with ${result.criteriaCount} criteria. Review and approve it before use.`); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not draft a rubric."); }
    finally { setBusy(false); }
  }
  return <div className="rubric-actions">
    {rubrics.map((rubric) => <RubricReview key={rubric.id} rubric={rubric} />)}
    {!rubrics.some((rubric) => rubric.source_kind === "official") && <OfficialRubricRecorder assessmentId={assessmentId} materials={officialMaterials} />}
    {!rubrics.some((rubric) => rubric.source_kind === "official") && <button className="button button-light rubric-draft-button" type="button" onClick={draft} disabled={disabled || busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />} Draft inferred rubric</button>}
    {disabled && !rubrics.some((rubric) => rubric.source_kind === "official") && <p className="scope-note">AI rubric drafting is disabled until a provider is configured and excerpt processing is approved.</p>}
    {message && <p className="form-success">{message}</p>}{error && <p className="form-error">{error}</p>}
  </div>;
}

function OfficialRubricRecorder({ assessmentId, materials }: { assessmentId: string; materials: { id: string; name: string }[] }) {
  const router = useRouter();
  const [json, setJson] = useState('[\n  { "title": "Criterion", "description": "Faculty wording", "weight": 50, "maximumMarks": 50, "sourceReference": "Rubric, page 1" },\n  { "title": "Second criterion", "description": "Faculty wording", "weight": 50, "maximumMarks": 50, "sourceReference": "Rubric, page 1" }\n]');
  const [maximumMarks, setMaximumMarks] = useState("100");
  const [sourceMaterialId, setSourceMaterialId] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const criteria: unknown = JSON.parse(json);
      const response = await fetch("/api/rubrics/official", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId, maximumMarks: Number(maximumMarks), sourceMaterialId: sourceMaterialId || undefined, criteria }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save the official rubric.");
      setOpen(false); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the official rubric."); }
    finally { setBusy(false); }
  }
  return <details className="rubric-review official-rubric-recorder" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Record official faculty rubric</summary><p className="scope-note">Enter the faculty criteria exactly as issued. This record will be marked official and preserved.</p><form onSubmit={save}><label className="field"><span>Rubric maximum marks</span><input type="number" min="0.01" step="0.01" required value={maximumMarks} onChange={(event) => setMaximumMarks(event.target.value)} /></label>{materials.length > 0 && <label className="field"><span>Source document</span><select value={sourceMaterialId} onChange={(event) => setSourceMaterialId(event.target.value)}><option value="">Select source document</option>{materials.map((material) => <option value={material.id} key={material.id}>{material.name}</option>)}</select></label>}<label className="field"><span>Criteria JSON</span><textarea rows={9} value={json} onChange={(event) => setJson(event.target.value)} spellCheck={false} /></label>{error && <p className="form-error">{error}</p>}<button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Save official rubric</button></form></details>;
}

function RubricReview({ rubric }: { rubric: Rubric }) {
  const router = useRouter();
  const [open, setOpen] = useState(rubric.approval_status === "pending_review");
  const [json, setJson] = useState(() => JSON.stringify(rubric.rubric_criteria.map((item) => ({ id: item.id, title: item.title, description: item.description, weight: Number(item.weight), maximumMarks: Number(item.maximum_marks), sourceReference: item.source_reference })), null, 2));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(approvalStatus: "pending_review" | "approved") {
    setBusy(true); setError("");
    try {
      const criteria: unknown = JSON.parse(json);
      if (!Array.isArray(criteria)) throw new Error("Criteria must be a JSON array.");
      const response = await fetch(`/api/rubrics/${rubric.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ criteria, approvalStatus }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save this rubric.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this rubric."); }
    finally { setBusy(false); }
  }
  return <details className="rubric-review" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary><span>{rubric.source_kind === "official" ? "Official rubric" : "AI-inferred rubric"}</span><small>{rubric.approval_status.replaceAll("_", " ")} · maximum {rubric.maximum_marks} marks</small></summary>{rubric.source_kind === "official" ? <p className="scope-note">Official source rubric is read-only in this interface.</p> : <><p className="scope-note">Review the inferred criteria and references. Editing must preserve 100% total weight and the 100-mark assessment maximum.</p><label className="field"><span>Criteria JSON</span><textarea rows={10} value={json} onChange={(event) => setJson(event.target.value)} spellCheck={false} /></label>{error && <p className="form-error">{error}</p>}<div className="form-row"><button type="button" className="button button-light" disabled={busy} onClick={() => save("pending_review")}>{busy ? <LoaderCircle className="spin" size={14} /> : null} Save edits</button><button type="button" className="button button-primary" disabled={busy} onClick={() => save("approved")}><Check size={14} /> Approve rubric</button></div></>}</details>;
}
