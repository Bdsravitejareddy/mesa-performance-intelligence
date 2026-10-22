"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunBehaviourAnalysis({ hasConversations }: { hasConversations: boolean }) {
  const router = useRouter();
  const [include, setInclude] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/behaviour", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ includeConversations: include }) });
      const result = await response.json() as { error?: string; observed?: number };
      if (!response.ok) throw new Error(result.error ?? "Analysis failed.");
      setMessage(`Done: ${result.observed ?? 0} of 12 dimensions had enough evidence to describe.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Analysis failed."); }
    finally { setBusy(false); }
  }
  return <div className="info-callout describe-action"><span>Builds tentative hypotheses from your feedback, criterion marks, evaluations and Quality Checker reports. Quotes are checked against their sources.</span>
    {hasConversations && <label className="tagger-option"><input type="checkbox" checked={include} onChange={(event) => setInclude(event.target.checked)} /> Include my imported AI conversations (my messages only)</label>}
    <button className="button button-primary" type="button" disabled={busy} onClick={() => void run()}>{busy ? "Analysing…" : "Run analysis"}</button>{message && <small role="status">{message}</small>}</div>;
}

export function ConversationImport({ imports }: { imports: { id: string; title: string; source: string; message_count: number; conversation_count: number; created_at: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/conversations", { method: "POST", body: new FormData(form) });
      const result = await response.json() as { error?: string; messages?: number; conversations?: number };
      if (!response.ok) throw new Error(result.error ?? "Import failed.");
      setMessage(`Imported ${result.messages} of your messages from ${result.conversations} conversation${result.conversations === 1 ? "" : "s"}. Assistant replies were discarded.`);
      form.reset(); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this import permanently?")) return;
    await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  return <>
    {imports.length > 0 && <div className="link-list">{imports.map((item) => <div className="link-row" key={item.id}><span><strong>{item.title}</strong><small>{item.source} · {item.message_count} of your messages · {item.conversation_count} conversations · {new Date(item.created_at).toLocaleDateString()}</small></span><span /><span /><button className="button button-secondary" type="button" onClick={() => void remove(item.id)}>Delete</button></div>)}</div>}
    <form className="quality-form" onSubmit={submit}>
      <div className="form-row"><label className="field"><span>Source</span><select name="source" defaultValue="chatgpt"><option value="chatgpt">ChatGPT export (conversations.json)</option><option value="claude">Claude export</option><option value="gemini">Gemini</option><option value="other">Other / pasted</option></select></label><label className="field"><span>Name</span><input name="title" maxLength={200} placeholder="e.g. Case prep chats" /></label></div>
      <label className="field"><span>Export file (.json or .txt)</span><input name="file" type="file" accept=".json,.txt" /></label>
      <label className="field"><span>Or paste a conversation (lines starting “User:” / “Assistant:”)</span><textarea name="text" rows={3} /></label>
      <label className="tagger-option"><input type="checkbox" name="consent" value="yes" required /> I choose to import these conversations. Only my own messages are kept; I can delete them at any time.</label>
      <button className="button button-secondary" type="submit" disabled={busy}>{busy ? "Importing…" : "Import conversations"}</button>{message && <small role="status">{message}</small>}
    </form>
  </>;
}
