"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy } from "lucide-react";
import { PROFILE_PROMPT } from "@/lib/behaviour/profile-prompt";

export type SavedProfile = { id: string; source: string; created_at: string; findings: number; changes: { what: string; when: string }[]; observed: number };

export function AiProfileImport({ saved }: { saved: SavedProfile[] }) {
  const router = useRouter();
  const [source, setSource] = useState("chatgpt");
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setMessage("");
    const response = await fetch("/api/ai-context", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, reply }) });
    const body = await response.json().catch(() => ({})) as { error?: string; findings?: number; changes?: number };
    setBusy(false);
    if (!response.ok) { setMessage(body.error ?? "Could not save."); return; }
    setMessage(`Saved: ${body.findings} findings, ${body.changes} changes over time.`); setReply(""); router.refresh();
  };
  const remove = async (id: string) => { await fetch(`/api/ai-context?id=${id}`, { method: "DELETE" }); router.refresh(); };
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(PROFILE_PROMPT); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } };
  return <div className="ai-profile-import">
    <div className="prompt-box"><div className="prompt-box-head"><strong>1. Copy this prompt into ChatGPT, then each Claude account</strong><button type="button" className="button button-primary" onClick={() => void copy()}><Copy size={14} /> {copied ? "Copied" : "Copy prompt"}</button></div><pre>{PROFILE_PROMPT}</pre></div>
    <strong className="prompt-step">2. Paste each reply below</strong>
    <div className="field-row"><label className="field"><span>Written by</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="chatgpt">ChatGPT</option><option value="claude-personal">Claude (personal)</option><option value="claude-team">Claude (team account)</option><option value="other">Other</option></select></label></div>
    <label className="field"><span>Paste the assistant&apos;s whole reply to the profile prompt, including the JSON block at the end</span><textarea rows={6} value={reply} onChange={(event) => setReply(event.target.value)} /></label>
    <button type="button" className="button button-primary" disabled={busy || reply.trim().length < 50} onClick={save}>{busy ? "Saving…" : "Save profile"}</button>
    {message && <p className="scope-note" role="status">{message}</p>}
    {saved.length > 0 && <ul className="profile-list">{saved.map((item) => <li key={item.id}><span><strong>{item.source}</strong> · {new Date(item.created_at).toLocaleDateString()} · {item.findings} findings ({item.observed} observed){item.changes.length ? ` · changes: ${item.changes.map((change) => `${change.what}${change.when ? ` (${change.when})` : ""}`).join("; ")}` : ""}</span><button type="button" className="text-link" onClick={() => void remove(item.id)}>Delete</button></li>)}</ul>}
  </div>;
}
