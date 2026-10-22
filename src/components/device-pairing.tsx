"use client";

import { useEffect, useState } from "react";

type Pending = { id: string; displayCode: string; createdAt: string; expiresAt: string };

export function DevicePairing({ connections }: { connections: { id: string; label: string }[] }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const response = await fetch("/api/drive-sync/pairing-requests").catch(() => null);
      const body = response?.ok ? await response.json() as { requests: Pending[] } : { requests: [] };
      if (!stop) setPending(body.requests);
    };
    void load();
    const timer = window.setInterval(load, 4000);
    return () => { stop = true; window.clearInterval(timer); };
  }, []);
  const approve = async (requestId: string) => {
    setMessage("");
    const response = await fetch("/api/drive-sync/pairing-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, connectionId }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setMessage(response.ok ? "Approved. The script finishes pairing within a few seconds and starts its first scan." : body.error ?? "Could not approve.");
    setPending((items) => items.filter((item) => item.id !== requestId));
  };
  const download = async () => {
    const response = await fetch("/api/drive-sync/installer");
    const body = await response.json() as { code: string; manifest: string };
    for (const [name, text] of [["Code.gs", body.code], ["appsscript.json", body.manifest]] as const) {
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  return <section className="content-panel device-pairing" aria-label="Pair a Drive connector">
    <h2>Pair with a code</h2>
    <p className="empty-hint">The installer holds no secret. Paste it into Apps Script and run <b>install</b>; it logs a short code. Approve that code here within 5 minutes.</p>
    <div className="drive-actions"><button type="button" className="button" onClick={() => void download()}>Download installer (no secret)</button>
      {connections.length > 1 && <select value={connectionId} onChange={(event) => setConnectionId(event.target.value)} aria-label="Connection">{connections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}</div>
    {pending.length > 0 ? <ul className="pairing-requests">{pending.map((item) => <li key={item.id}><span><strong className="pairing-code" data-pairing-code>{item.displayCode}</strong><small>requested {new Date(item.createdAt).toLocaleTimeString()}</small></span><button type="button" className="button button-primary" onClick={() => void approve(item.id)}>Approve</button></li>)}</ul> : <p className="scope-note">No code waiting. Run install in Apps Script and its code appears here.</p>}
    {message && <p className="scope-note" role="status">{message}</p>}
  </section>;
}
