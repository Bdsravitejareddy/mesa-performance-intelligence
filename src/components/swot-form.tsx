"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";

export function SwotForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/swot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: form.get("category"), title: form.get("title"), evidence: form.get("evidence"), sourceReference: form.get("sourceReference") }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save this SWOT entry.");
      formElement.reset(); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this SWOT entry."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}><label className="field"><span>Category</span><select name="category"><option value="strength">Strength</option><option value="weakness">Weakness</option><option value="opportunity">Opportunity</option><option value="threat">Threat</option></select></label><label className="field"><span>Observation</span><input name="title" required maxLength={180} /></label><label className="field"><span>Evidence and context</span><textarea name="evidence" maxLength={4000} placeholder="Describe the assessment, feedback, or course context supporting this observation." /></label><label className="field"><span>Source reference</span><input name="sourceReference" maxLength={400} placeholder="Assessment or course page reference" /></label>{error && <p className="form-error">{error}</p>}<button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Add evidence</button></form>;
}
