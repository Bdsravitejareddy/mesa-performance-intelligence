"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldAlert } from "lucide-react";

export type QuarantinedMaterial = { material_id: string; name: string; course: string; reason: string; quarantined_at: string; purged_at: string | null };

// Files that look like they hold credentials: hidden everywhere, then erased only when the member chooses.
export function QuarantinedMaterials({ rows }: { rows: QuarantinedMaterial[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  if (!rows.length) return null;
  const purge = async (row: QuarantinedMaterial) => {
    if (!window.confirm(`Permanently erase the text and stored copy of “${row.name}”? This cannot be undone. Delete it from Google Drive and rotate any keys it held as well.`)) return;
    setBusy(row.material_id);
    const response = await fetch(`/api/materials/${row.material_id}/purge`, { method: "POST" });
    const body = await response.json().catch(() => ({})) as { error?: string; pages?: number };
    setBusy("");
    setMessage(response.ok ? `Erased “${row.name}” (${body.pages ?? 0} indexed pages).` : body.error ?? "Could not erase the file.");
    if (response.ok) router.refresh();
  };
  return <section className="content-panel quarantine-panel" aria-labelledby="quarantine-title">
    <h2 id="quarantine-title"><ShieldAlert size={18} /> Quarantined files</h2>
    <p className="scope-note">These look like they contain API keys, passwords or other credentials. They are hidden from every page, search, AI grading and guests. Treat any key in them as exposed: rotate it with its provider, delete the file from Google Drive, then erase the stored copy here.</p>
    <ul className="quarantine-list">{rows.map((row) => <li key={row.material_id}>
      <span><strong>{row.name}</strong><small>{row.course} · {row.reason}</small></span>
      {row.purged_at ? <em>Erased {new Date(row.purged_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</em>
        : <button type="button" className="button button-secondary" disabled={busy === row.material_id} onClick={() => void purge(row)}>{busy === row.material_id ? "Erasing…" : "Erase permanently"}</button>}
    </li>)}</ul>
    {message && <p className="scope-note" role="status">{message}</p>}
  </section>;
}
