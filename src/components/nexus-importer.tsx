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
    const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    try {
      // One page, or a batch: files are matched to their page by the "<first 8 id characters>__" name prefix.
      const parsed = JSON.parse(payload) as { assignmentId: string } | { assignmentId: string }[];
      const pages = Array.isArray(parsed) ? parsed : [parsed];
      const results: unknown[] = [];
      for (const page of pages) {
        const form = new FormData();
        form.set("payload", JSON.stringify(page));
        const prefix = `${page.assignmentId.slice(0, 8)}__`;
        for (const file of files.filter((item) => !Array.isArray(parsed) || item.name.startsWith(prefix))) form.append("file", new File([file], file.name.replace(/^[0-9a-f]{8}__/, ""), { type: file.type }));
        const response = await fetch("/api/imports/nexus-submission", { method: "POST", body: form });
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { assessment?: string; error?: string; files?: { name: string; status: string; note?: string }[]; links?: number };
        results.push({ id: page.assignmentId.slice(0, 8), assessment: body.assessment, error: body.error, links: body.links, files: body.files?.map((file) => `${file.status}: ${file.name}${file.note ? ` (${file.note})` : ""}`) });
      }
      setResult(JSON.stringify(results, null, 1));
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
