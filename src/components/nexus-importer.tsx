"use client";

import { useEffect, useState } from "react";

const NEXUS_ORIGIN = "https://students.mesaschool.co.in";
type Incoming = { kind?: string; requestId?: string; payload?: unknown; files?: { name: string; type: string; buffer: ArrayBuffer }[] };

async function importPage(payload: unknown, files: File[]) {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  for (const file of files) form.append("file", file);
  const response = await fetch("/api/imports/nexus-submission", { method: "POST", body: form });
  return { status: response.status, body: await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as Record<string, unknown> };
}

// Member-approved capture (see AGENTS.md). The Nexus window this page opens hands each assignment page's
// details and submitted files here with postMessage, so nothing is downloaded and no signed link leaves the browser.
export function NexusImporter() {
  const [payload, setPayload] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onMessage = async (event: MessageEvent<Incoming>) => {
      if (event.origin !== NEXUS_ORIGIN || event.data?.kind !== "mesa-nexus-capture") return;
      const files = (event.data.files ?? []).slice(0, 10).filter((file) => file.buffer instanceof ArrayBuffer).map((file) => new File([file.buffer], String(file.name).slice(0, 200), { type: String(file.type) }));
      const result = await importPage(event.data.payload, files);
      const body = result.body as { assessment?: string; error?: string; files?: { name: string; status: string; note?: string }[]; links?: number };
      setLog((lines) => [`${result.status} ${body.assessment ?? body.error ?? ""} · links ${body.links ?? 0} · ${(body.files ?? []).map((file) => `${file.status} ${file.name}${file.note ? ` (${file.note})` : ""}`).join(", ") || "no files"}`, ...lines].slice(0, 80));
      (event.source as Window | null)?.postMessage({ kind: "mesa-nexus-capture-result", requestId: event.data.requestId, status: result.status, body }, event.origin);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    try {
      // One page, or a batch: files are matched to their page by the "<first 8 id characters>__" name prefix.
      const parsed = JSON.parse(payload) as { assignmentId: string } | { assignmentId: string }[];
      const pages = Array.isArray(parsed) ? parsed : [parsed];
      for (const page of pages) {
        const prefix = `${page.assignmentId.slice(0, 8)}__`;
        const mine = files.filter((item) => !Array.isArray(parsed) || item.name.startsWith(prefix)).map((file) => new File([file], file.name.replace(/^[0-9a-f]{8}__/, ""), { type: file.type }));
        const result = await importPage(page, mine);
        const body = result.body as { assessment?: string; error?: string; files?: { name: string; status: string }[] };
        setLog((lines) => [`${result.status} ${body.assessment ?? body.error ?? ""} · ${(body.files ?? []).map((file) => `${file.status} ${file.name}`).join(", ") || "no files"}`, ...lines]);
      }
      if (input) input.value = "";
    } catch {
      setLog((lines) => ["Import failed: the page details are not valid JSON.", ...lines]);
    } finally { setBusy(false); }
  };

  return <div className="nexus-importer-wrap">
    <section className="content-panel nexus-importer">
      <h2>Capture from Nexus</h2>
      <p className="empty-hint">Opens Nexus in a linked window. Each assignment page you open there can send its submission details and files straight to this page.</p>
      <button type="button" className="button button-primary" data-nexus-open onClick={() => window.open(`${NEXUS_ORIGIN}/student/lms/assignments`, "nexus-capture")}>Open Nexus capture window</button>
    </section>
    <form className="content-panel nexus-importer" onSubmit={submit}>
      <label className="field"><span>Page details (JSON: assignmentId, capture, links)</span><textarea name="payload" rows={4} value={payload} onChange={(event) => setPayload(event.target.value)} required /></label>
      <label className="field"><span>Submitted files downloaded from the page</span><input type="file" name="file" multiple accept=".pdf,.pptx,.docx,.xlsx" /></label>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Importing…" : "Import"}</button>
    </form>
    {log.length > 0 && <pre className="import-result" aria-live="polite" data-import-log>{log.join("\n")}</pre>}
  </div>;
}
