"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, LoaderCircle, Save, Trash2 } from "lucide-react";

export type SubmissionMaterialOption = { id: string; name: string; sourceKind: string; version: number };
export type SubmissionDocumentItem = { id: string; name: string; sourceKind: string; extractionStatus: string; sourceVersion: string };
function label(value: string) { const text = value.replaceAll("_", " "); return text.charAt(0).toUpperCase() + text.slice(1); }

export function SubmissionForm({ assessmentId, submissionId, courseMaterials = [], documents = [] }: { assessmentId: string; submissionId?: string; courseMaterials?: SubmissionMaterialOption[]; documents?: SubmissionDocumentItem[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState("");
  const [activeSubmissionId, setActiveSubmissionId] = useState(submissionId);
  const activeSubmissionIdRef = useRef(submissionId);

  async function attachEvidence(targetSubmissionId: string, file?: File | null) {
    if (!file && !selectedMaterial) return;
    const response = file
      ? await fetch(`/api/submissions/${encodeURIComponent(targetSubmissionId)}/documents`, { method: "POST", body: (() => { const body = new FormData(); body.set("file", file); return body; })() })
      : await fetch(`/api/submissions/${encodeURIComponent(targetSubmissionId)}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseMaterialId: selectedMaterial }) });
    const result = (await response.json()) as { error?: string; name?: string; extractionStatus?: string };
    if (!response.ok) throw new Error(result.error ?? "Submission file could not be attached.");
    setMessage(`${result.name ?? file?.name ?? "Course material"} attached · ${(result.extractionStatus ?? "complete").replaceAll("_", " ")}`);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("submission-file");
    const selectedFile = file instanceof File && file.size ? file : null;
    setBusy(true);
    setError("");
    setMessage("");
    const markText = String(form.get("officialMark") ?? "").trim();
    const officialMark = markText ? Number(markText) : null;
    try {
      let targetSubmissionId = activeSubmissionIdRef.current;
      if (!targetSubmissionId) {
        const response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId, answerText: form.get("answerText"), officialMark, officialFeedback: form.get("officialFeedback") }) });
        const result = (await response.json()) as { id?: string; error?: string };
        if (!response.ok || !result.id) throw new Error(result.error ?? "Could not save this assessment record.");
        targetSubmissionId = result.id;
        activeSubmissionIdRef.current = result.id;
        setActiveSubmissionId(result.id);
      }
      await attachEvidence(targetSubmissionId, selectedFile);
      if (selectedFile || selectedMaterial) setSelectedMaterial("");
      if (!submissionId) formElement.reset();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this assessment record.");
    } finally { setBusy(false); }
  }
  async function removeEvidence(documentId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(activeSubmissionIdRef.current ?? "")}/documents`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId }) });
      const result = (await response.json()) as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error ?? "Submission evidence could not be removed.");
      if (result.warning) setMessage(result.warning);
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Submission evidence could not be removed."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="submission-form">
    {!activeSubmissionId && <><label className="field"><span>Student answer or work notes</span><textarea name="answerText" maxLength={100000} placeholder="Paste your answer or a short evidence note…" /></label><div className="form-row"><label className="field"><span>Official mark <small>(out of 100)</small></span><input type="number" name="officialMark" min="0" max="100" step="0.01" placeholder="Optional" /></label><label className="field"><span>Official feedback</span><input name="officialFeedback" maxLength={10000} placeholder="Optional evaluator feedback" /></label></div></>}
    {documents.length > 0 && <div className="submission-document-list"><strong>Attached evidence</strong>{documents.map((document) => <div className="submission-document-row" key={document.id}><span><b>{document.name}</b><small>{label(document.sourceKind)} · {label(document.extractionStatus)} · {document.sourceVersion}</small></span>{activeSubmissionId && <button className="button button-quiet" type="button" disabled={busy} onClick={() => void removeEvidence(document.id)}><Trash2 size={14} /> Remove evidence</button>}</div>)}</div>}
    <label className="field"><span>{activeSubmissionId ? "Attach PDF or PPTX" : "Attach submission file"} <small>(optional · 20 MiB maximum)</small></span><input name="submission-file" type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={() => setSelectedMaterial("")} /></label>
    <label className="field"><span>Link indexed course material <small>(optional)</small></span><select value={selectedMaterial} onChange={(event) => { setSelectedMaterial(event.target.value); const input = event.currentTarget.form?.elements.namedItem("submission-file"); if (input instanceof HTMLInputElement) input.value = ""; }}><option value="">No material selected</option>{courseMaterials.map((material) => <option value={material.id} key={material.id}>{material.name} · {label(material.sourceKind)} · v{material.version}</option>)}</select></label>
    <p className="upload-help">PDF and PPTX files are extracted and stored in private submission storage. Linked material is limited to indexed files in this course.</p>
    {error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}
    <button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : activeSubmissionId ? <FilePlus2 size={15} /> : <Save size={15} />} {busy ? "Saving evidence…" : activeSubmissionId ? "Attach evidence" : "Save assessment evidence"}</button>
  </form>;
}
