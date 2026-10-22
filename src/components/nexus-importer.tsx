"use client";

import { useState } from "react";

export function NexusImporter() {
  const [payload, setPayload] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setResult("Importing…");
    const form = new FormData();
    form.set("payload", payload);
    const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
    for (const file of Array.from(input?.files ?? [])) form.append("file", file);
    try {
      const response = await fetch("/api/imports/nexus-submission", { method: "POST", body: form });
      setResult(JSON.stringify(await response.json(), null, 2));
      if (input) input.value = "";
    } catch {
      setResult("Import failed.");
    } finally { setBusy(false); }
  };
  return <form className="content-panel nexus-importer" onSubmit={submit}>
    <label className="field"><span>Page details (JSON: assignmentId, capture, links)</span><textarea name="payload" rows={5} value={payload} onChange={(event) => setPayload(event.target.value)} required /></label>
    <label className="field"><span>Submitted files downloaded from the page</span><input type="file" name="file" multiple accept=".pdf,.pptx,.docx,.xlsx" /></label>
    <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Importing…" : "Import"}</button>
    {result && <pre className="import-result" aria-live="polite">{result}</pre>}
  </form>;
}
