"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Match = { materialId: string; name: string; assessment: string; course: string; confidence: string; reason: string; attached: boolean };

export function DriveSubmissions({ matches, undetermined }: { matches: Match[]; undetermined: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function run() {
    setBusy("run");
    setMessage("Checking Drive files against assessments…");
    try {
      const response = await fetch("/api/materials/submissions", { method: "POST" });
      const result = await response.json() as { outcomes?: { kind: string; attached: boolean }[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Matching failed.");
      const outcomes = result.outcomes ?? [];
      setMessage(`Checked ${outcomes.length} file${outcomes.length === 1 ? "" : "s"}: ${outcomes.filter((item) => item.attached).length} submission${outcomes.filter((item) => item.attached).length === 1 ? "" : "s"} attached.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Matching failed.");
    } finally {
      setBusy("");
    }
  }
  async function reject(materialId: string) {
    setBusy(materialId);
    try {
      const response = await fetch("/api/materials/submissions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materialId }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error || "Could not save.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }
  return <>
    <div className="info-callout describe-action"><span>Files in your course folders are checked nightly: names are matched to assessments, then Gemini decides whether each match is your own work or course material. {undetermined > 0 ? `${undetermined} match${undetermined === 1 ? " is" : "es are"} waiting for AI classification.` : ""}</span><button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={run}>{busy === "run" ? "Checking…" : "Find my submissions now"}</button>{message && <small role="status">{message}</small>}</div>
    {matches.length ? <div className="link-list">{matches.map((item) => <div className="link-row" key={item.materialId}>
      <span><strong>{item.name}</strong><small>{item.course}</small></span>
      <span className="link-arrow" aria-hidden>→</span>
      <span><strong>{item.assessment}</strong><small>{item.attached ? "Attached as submission evidence" : "Recognised, not attached"} · {item.confidence} confidence</small><small>{item.reason}</small></span>
      <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => reject(item.materialId)}>{busy === item.materialId ? "Saving…" : "Not mine"}</button>
    </div>)}</div> : <p className="empty-hint">No submissions recognised yet.</p>}
  </>;
}
