"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PageNoteEditor({ materialId, pageNumber, initial }: { materialId: string; pageNumber: number; initial: string }) {
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(`/api/materials/${materialId}/notes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageNumber, note }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save.");
      setSaved(note.trim());
      setStatus(note.trim() ? "Saved" : "Cleared");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="page-note">
    <textarea aria-label={`Note for slide ${pageNumber}`} rows={2} maxLength={2000} value={note} placeholder="e.g. Bar chart: Indian D2C market share by category, 2024; beauty is the largest at 31%." onChange={(event) => setNote(event.target.value)} />
    <div className="page-note-actions"><button className="button button-secondary" type="button" disabled={busy || note.trim() === saved} onClick={save}>{busy ? "Saving…" : "Save note"}</button>{status && <small role="status">{status}</small>}</div>
  </div>;
}

export function MaterialReviewActions({ materialId, current, attentionCount, notesCount }: { materialId: string; current: { outcome: string; note: string } | null; attentionCount: number; notesCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send(method: "PUT" | "DELETE", outcome?: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/materials/${materialId}/review`, { method, headers: { "Content-Type": "application/json" }, body: method === "PUT" ? JSON.stringify({ outcome, note: "" }) : undefined });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return <div className={`info-callout review-actions${current ? "" : " data-quality-warning"}`}>
    <span>{current ? `${current.outcome === "reviewed" ? "Reviewed" : "Marked as not needing notes"}. ${notesCount} note${notesCount === 1 ? "" : "s"} saved.` : `${attentionCount} slide${attentionCount === 1 ? "" : "s"} to look at · ${notesCount} note${notesCount === 1 ? "" : "s"} saved so far.`}</span>
    <span className="review-buttons">{current ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => send("DELETE")}>Reopen</button> : <><button className="button button-primary" type="button" disabled={busy} onClick={() => send("PUT", "reviewed")}>Mark reviewed</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => send("PUT", "not_needed")}>No notes needed</button></>}</span>
    {message && <small role="status">{message}</small>}
  </div>;
}

// Runs AI description for one material, or repeatedly for all pending materials until nothing is left.
export function DescribeMaterialsButton({ materialId, available, reason }: { materialId?: string; available: boolean; reason: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run() {
    setBusy(true);
    setMessage("Describing slides with Gemini. Large decks take up to a minute each…");
    let described = 0;
    let failed = 0;
    try {
      for (let round = 0; round < (materialId ? 1 : 10); round += 1) {
        const response = await fetch("/api/materials/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(materialId ? { materialId } : {}) });
        const result = await response.json() as { outcomes?: { status: string; described: number; message: string }[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Description failed.");
        const outcomes = result.outcomes ?? [];
        described += outcomes.reduce((sum, item) => sum + item.described, 0);
        failed += outcomes.filter((item) => item.status === "failed").length;
        router.refresh();
        if (!outcomes.length || materialId) {
          if (materialId && outcomes[0]?.status !== "succeeded") setMessage(outcomes[0]?.message ?? "Nothing to describe.");
          break;
        }
        setMessage(`Described ${described} slide${described === 1 ? "" : "s"} so far…`);
      }
      setMessage((current) => current.startsWith("Describing") || current.startsWith("Described ") ? `Done: ${described} slide${described === 1 ? "" : "s"} described${failed ? `, ${failed} document${failed === 1 ? "" : "s"} failed (see details)` : ""}.` : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Description failed.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="info-callout describe-action"><span>{available ? "Gemini reads the images, charts, diagrams and colour coding in these slides; nothing needs to be typed." : `AI description is off: ${reason}`}</span><button className="button button-primary" type="button" disabled={!available || busy} onClick={run}>{busy ? "Describing…" : materialId ? "Describe with AI" : "Describe all with AI"}</button>{message && <small role="status">{message}</small>}</div>;
}
