"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STATE_LABELS } from "@/lib/competency/classify";

type Recommendation = { competencyId: string; competency: string; state: string; confidence: string; importance: { weight: number; reasons: string[] }; gap: number; confidenceFactor: number; priority: number; activity: { title: string; why: string; effortHours: number; kind: string } };
type PlanItem = { id: string; competency: string; activity: string; rationale: string; effort_hours: number; status: string; start_state: string; currentState: string | null; outcome: string | null; created_at: string; completed_at: string | null };

const OUTCOMES: Record<string, string> = { improved: "Improved: the classification moved up on new evidence", unchanged: "New evidence, same classification", worse: "New evidence, classification moved down", no_new_evidence: "No new evidence yet — add the work this produced so it can be judged" };
// The same state names as the Skills page, so a skill is described the same way on both.
const STATES: Record<string, string> = STATE_LABELS;
// Why an item ranks where it does, in words; the numbers stay in "How this is ranked".
const STATE_REASON: Record<string, string> = { development_area: "low results in two or more assessments", conflicting: "your results disagree", insufficient_evidence: "not enough marked evidence yet", emerging: "one high result so far", meets_expectations: "mid-range results so far", demonstrated_strength: "already a strength" };
const CONFIDENCE_REASON: Record<string, string> = { high: "", medium: "", low: "the evidence is thin, so this may change", insufficient: "nothing is counted yet, so this ranks slightly lower than a confirmed gap" };
export function rankReason(item: Pick<Recommendation, "importance" | "state" | "confidence">): string {
  return [item.importance.reasons.slice(0, 2).join("; "), STATE_REASON[item.state], CONFIDENCE_REASON[item.confidence]].filter(Boolean).join(" · ");
}

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
      <small className="roadmap-reason"><b>Why it ranks here:</b> {rankReason(item)}.</small>
      <details className="roadmap-formula"><summary>How this is ranked</summary><small>Score {item.priority} = how much your target roles need it ({item.importance.weight}) × how far the evidence is from a strength ({item.gap}) × how sure the evidence is ({item.confidenceFactor}). A requirement of a primary role counts 3, a cross-compatible role half that, a preferred skill less; each further role asking for it adds 0.25 (up to 1.5), and being assessed in your courses adds 1.</small></details></div>
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
