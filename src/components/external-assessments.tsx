"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Enter results from 16Personalities and CliftonStrengths, or import an IPIP-NEO result PDF; all are kept as
// labelled self-reports.
export function ExternalAssessmentsForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  async function send(payload: Record<string, unknown>) {
    setMessage("Saving…");
    const response = await fetch("/api/external-assessments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setMessage(response.ok ? "Saved. It feeds the AI view and behaviour analysis in the next refresh." : body.error ?? "Could not save.");
    if (response.ok) router.refresh();
  }
  return <div className="external-form">
    <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void send({ kind: "16personalities", type: form.get("type"), percents: Object.fromEntries(["mind", "energy", "nature", "tactics", "identity"].map((key) => [key, form.get(key)]).filter(([, value]) => value)) }); }}>
      <strong>16Personalities</strong>
      <div className="external-row"><input name="type" placeholder="Type, e.g. INTJ-A" required className="field-input" />
        {[["mind", "Mind %"], ["energy", "Energy %"], ["nature", "Nature %"], ["tactics", "Tactics %"], ["identity", "Identity %"]].map(([key, label]) => <input key={key} name={key} type="number" min={50} max={100} placeholder={label} className="field-input small" />)}</div>
      <small className="empty-hint">Percentages are optional: the strength of each letter as 16Personalities reports it (e.g. 70% Introverted).</small>
      <button type="submit" className="button button-secondary">Save type</button>
    </form>
    <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void send({ kind: "cliftonstrengths", themes: form.get("themes") }); }}>
      <strong>CliftonStrengths</strong>
      <textarea name="themes" rows={2} placeholder="Your top themes in order, separated by commas — e.g. Strategic, Learner, Achiever, Analytical, Focus" className="field-input" required />
      <button type="submit" className="button button-secondary">Save themes</button>
    </form>
    <form onSubmit={async (event) => {
      event.preventDefault();
      setMessage("Reading the PDF…");
      const response = await fetch("/api/external-assessments", { method: "POST", body: new FormData(event.currentTarget) });
      const body = await response.json().catch(() => ({})) as { error?: string; form?: string; facets?: number; anomalies?: string[] };
      setMessage(response.ok ? `Saved ${body.form}: 5 traits, ${body.facets} facets.${body.anomalies?.length ? ` Note: ${body.anomalies.join(" ")}` : ""}` : body.error ?? "Could not save.");
      if (response.ok) router.refresh();
    }}>
      <strong>IPIP-NEO (Big Five with facets)</strong>
      <input name="file" type="file" accept="application/pdf,.pdf" required className="field-input" />
      <small className="empty-hint">The result PDF from an IPIP-NEO test (e.g. the 120- or 300-statement version). Traits, facets and the site&apos;s percentiles are read as printed.</small>
      <button type="submit" className="button button-secondary">Import result</button>
    </form>
    {message && <small role="status">{message}</small>}
  </div>;
}
