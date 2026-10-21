"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ChallengeRow = { id: string; disputed_state: string; statement: string; counterevidence: string; status: string; resolution_note: string; created_at: string; resolved_at: string | null };

export function CompetencyChallenge({ competencyId, currentState, stateLabel, challenges }: { competencyId: string; currentState: string; stateLabel: string; challenges: ChallengeRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [counterevidence, setCounterevidence] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function call(method: "POST" | "PATCH", body: Record<string, string>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/competency-challenges", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save.");
      if (method === "POST") { setStatement(""); setCounterevidence(""); setOpen(false); }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="competency-challenge">
    <h3>Challenges</h3>
    {challenges.length ? <ul className="challenge-list">{challenges.map((item) => <li key={item.id} className={`challenge-${item.status}`}>
      <span className="challenge-status">{item.status === "open" ? "Open" : item.status === "resolved" ? "Resolved" : "Withdrawn"} · {new Date(item.created_at).toLocaleDateString()}</span>
      <p>{item.statement}</p>
      {item.counterevidence && <p className="challenge-counter">Counterevidence: {item.counterevidence}</p>}
      {item.resolution_note && <p className="challenge-counter">Outcome: {item.resolution_note}</p>}
      {item.status === "open" && <div className="challenge-actions">
        <input type="text" placeholder="Outcome note (needed to resolve)" value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} aria-label="Outcome note" />
        <button className="button button-secondary" type="button" disabled={busy || !(notes[item.id] ?? "").trim()} onClick={() => call("PATCH", { id: item.id, status: "resolved", resolutionNote: notes[item.id] ?? "" })}>Resolve</button>
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => call("PATCH", { id: item.id, status: "withdrawn", resolutionNote: notes[item.id] ?? "" })}>Withdraw</button>
      </div>}
    </li>)}</ul> : <p>No challenges filed.</p>}
    {!open ? <button className="button button-secondary" type="button" onClick={() => setOpen(true)}>Challenge “{stateLabel}”</button> : <form className="challenge-form" onSubmit={(event) => { event.preventDefault(); void call("POST", { competencyId, disputedState: currentState, statement, counterevidence }); }}>
      <label className="field"><span>Why is this conclusion wrong or incomplete?</span><textarea required maxLength={2000} rows={3} value={statement} onChange={(event) => setStatement(event.target.value)} /></label>
      <label className="field"><span>Counterevidence (optional): work, feedback or results the evidence above misses</span><textarea maxLength={4000} rows={3} value={counterevidence} onChange={(event) => setCounterevidence(event.target.value)} /></label>
      <div className="challenge-actions"><button className="button button-primary" type="submit" disabled={busy || !statement.trim()}>{busy ? "Saving…" : "File challenge"}</button><button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
      <small>A challenge is kept with this conclusion. It does not change the classification by itself; add or re-tag evidence, then resolve it with a note.</small>
    </form>}
    {message && <p role="status" className="form-error">{message}</p>}
  </div>;
}
