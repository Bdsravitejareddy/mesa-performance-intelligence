"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";

export function RoleProfileForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const competencies = String(form.get("competencies") ?? "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), industry: form.get("industry"), source: form.get("source"), competencies }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save this profile.");
      formElement.reset(); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this profile."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}><label className="field"><span>Role title</span><input name="title" required maxLength={160} placeholder="e.g. Marketing analyst" /></label><label className="field"><span>Industry</span><input name="industry" maxLength={120} /></label><label className="field"><span>Benchmark source</span><input name="source" maxLength={400} placeholder="Job description URL or standard name" /></label><label className="field"><span>Competencies</span><textarea name="competencies" required rows={5} placeholder="One competency per line" /></label>{error && <p className="form-error">{error}</p>}<button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Save role profile</button></form>;
}
