"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Recommendation = { competencyId: string; competency: string; state: string; confidence: string; importance: { weight: number; reasons: string[] }; gap: number; confidenceFactor: number; priority: number; activity: { title: string; why: string; effortHours: number; kind: string } };
type PlanItem = { id: string; competency: string; activity: string; rationale: string; effort_hours: number; status: string; start_state: string; currentState: string | null; outcome: string | null; created_at: string; completed_at: string | null };

const OUTCOMES: Record<string, string> = { improved: "Improved: the classification moved up on new evidence", unchanged: "New evidence, same classification", worse: "New evidence, classification moved down", no_new_evidence: "No new evidence yet — add the work this produced so it can be judged" };
const STATES: Record<string, string> = { demonstrated_strength: "Demonstrated strength", emerging: "Emerging", meets_expectations: "Meets expectations", development_area: "Development area", conflicting: "Conflicting evidence", insufficient_evidence: "Insufficient evidence" };

export function RoadmapRecommendations({ items }: { items: Recommendation[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function add(item: Recommendation) {
    setBusy(item.competencyId); setMessage("");
    try {
      const response = await fetch("/api/roadmap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competencyId: item.competencyId, activity: item.activity.title, kind: item.activity.kind, rationale: item.activity.why, priority: item.priority, effortHours: item.activity.effortHours }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Could not add.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add."); }
    finally { setBusy(""); }
  }
  if (!items.length) return <p className="empty-hint">No recommendations yet. Tag assessments on the Competency map or save a target role so the roadmap knows what matters.</p>;
  return <div className="roadmap-list">{message && <p className="form-error">{message}</p>}{items.map((item, index) => <article className="roadmap-item" key={item.competencyId}>
    <span className="roadmap-rank">{String(index + 1).padStart(2, "0")}</span>
    <div><strong>{item.activity.title}</strong><p>{item.activity.why}</p>
      <small>{item.competency} · {STATES[item.state]} · {item.confidence} confidence · ~{item.activity.effortHours} h (planning assumption)</small>
      <small className="roadmap-formula">Priority {item.priority} = importance {item.importance.weight} ({item.importance.reasons.join("; ") || "general"}) × gap {item.gap} × confidence {item.confidenceFactor}</small></div>
    <button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={() => void add(item)}>{busy === item.competencyId ? "Adding…" : "Add to my plan"}</button>
  </article>)}</div>;
}

export function RoadmapPlan({ items }: { items: PlanItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  async function set(id: string, status: string) {
    setBusy(id);
    try { await fetch("/api/roadmap", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); router.refresh(); }
    finally { setBusy(""); }
  }
  if (!items.length) return <p className="empty-hint">Nothing in your plan yet.</p>;
  return <div className="roadmap-list">{items.map((item) => <article className={`roadmap-item plan-${item.status}`} key={item.id}>
    <span className="roadmap-rank">{item.status === "done" ? "✓" : item.status === "dropped" ? "–" : "•"}</span>
    <div><strong>{item.activity}</strong><small>{item.competency} · started at {STATES[item.start_state] ?? item.start_state}{item.currentState ? ` · now ${STATES[item.currentState]}` : ""} · ~{item.effort_hours} h</small>
      {item.outcome && <small className={`roadmap-outcome outcome-${item.outcome}`}>{OUTCOMES[item.outcome]}</small>}</div>
    <span className="claim-actions">{item.status === "planned" && <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void set(item.id, "in_progress")}>Start</button>}{(item.status === "planned" || item.status === "in_progress") && <><button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={() => void set(item.id, "done")}>Mark done</button><button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void set(item.id, "dropped")}>Drop</button></>}</span>
  </article>)}</div>;
}
