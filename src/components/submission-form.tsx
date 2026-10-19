"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save } from "lucide-react";

export function SubmissionForm({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    const markText = String(form.get("officialMark") ?? "").trim();
    const officialMark = markText ? Number(markText) : null;
    try {
      const response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId, answerText: form.get("answerText"), officialMark, officialFeedback: form.get("officialFeedback") }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save this assessment record.");
      formElement.reset();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this assessment record.");
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit}><label className="field"><span>Student answer or work notes</span><textarea name="answerText" maxLength={100000} placeholder="Paste your answer or a short evidence note…" /></label><div className="form-row"><label className="field"><span>Official mark <small>(out of 100)</small></span><input type="number" name="officialMark" min="0" max="100" step="0.01" placeholder="Optional" /></label><label className="field"><span>Official feedback</span><input name="officialFeedback" maxLength={10000} placeholder="Optional evaluator feedback" /></label></div>{error && <p className="form-error">{error}</p>}<button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} Save assessment evidence</button></form>;
}
