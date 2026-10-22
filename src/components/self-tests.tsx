"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ReasoningItem = { id: string; section: string; prompt: string; options: string[] };
type ReasoningResult = { correct: number; total: number; percent: number; sections: Record<string, { correct: number; total: number; percent: number }>; review: { id: string; correct: boolean; explanation: string }[]; overtime: boolean };
const SCALE = ["Very inaccurate", "Moderately inaccurate", "Neither", "Moderately accurate", "Very accurate"];

export function ReasoningTest() {
  const router = useRouter();
  const [attempt, setAttempt] = useState<{ id: string; items: ReasoningItem[]; deadline: number } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<ReasoningResult | null>(null);
  const [error, setError] = useState("");
  const submitted = useRef(false);

  useEffect(() => {
    if (!attempt || result) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [attempt, result]);

  async function start() {
    setError(""); setResult(null); setAnswers({}); setIndex(0); submitted.current = false;
    const response = await fetch("/api/tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "reasoning" }) });
    const value = await response.json() as { attemptId: string; items: ReasoningItem[]; seconds: number; error?: string };
    if (!response.ok) { setError(value.error ?? "Could not start."); return; }
    setAttempt({ id: value.attemptId, items: value.items, deadline: Date.now() + value.seconds * 1000 });
  }
  async function submit() {
    if (!attempt || submitted.current) return;
    submitted.current = true;
    const response = await fetch("/api/tests", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: attempt.id, answers }) });
    const value = await response.json() as { result?: ReasoningResult; error?: string };
    if (!response.ok || !value.result) { setError(value.error ?? "Could not submit."); submitted.current = false; return; }
    setResult(value.result);
    router.refresh();
  }
  const remaining = attempt ? Math.max(0, Math.round((attempt.deadline - now) / 1000)) : 0;
  useEffect(() => { if (attempt && !result && remaining === 0) void submit(); });

  if (result) return <div className="test-result">
    <strong className="quality-score">{result.correct}/{result.total}</strong>
    <p>{Object.entries(result.sections).map(([section, value]) => `${section}: ${value.correct}/${value.total}`).join(" · ")}{result.overtime ? " · submitted after the time limit" : ""}</p>
    <ul className="test-review">{result.review.map((item, position) => <li key={item.id} className={item.correct ? "ok" : "miss"}>Q{position + 1} {item.correct ? "✓" : "✗"} <small>{item.explanation}</small></li>)}</ul>
    <p className="scope-note">Practice evidence for Numerical analysis and Logical reasoning on the Competency map (only your two latest attempts count). Self-administered and not proctored — not an IQ score.</p>
    <button className="button button-secondary" type="button" onClick={() => void start()}>Take a new test</button>
  </div>;
  if (!attempt) return <div><p className="empty-hint">12 new questions each time — 4 numerical, 4 logical, 4 verbal — in 12 minutes. Answers are checked on the server.</p><button className="button button-primary" type="button" onClick={() => void start()}>Start reasoning test</button>{error && <p className="form-error">{error}</p>}</div>;
  const item = attempt.items[index];
  return <div className="test-runner">
    <header><span className="eyebrow">{item.section} · question {index + 1} of {attempt.items.length}</span><span className={`test-clock${remaining < 60 ? " urgent" : ""}`}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span></header>
    <p className="test-prompt">{item.prompt}</p>
    <div className="test-options">{item.options.map((option, choice) => <button key={option} type="button" className={answers[item.id] === choice ? "selected" : ""} onClick={() => setAnswers((current) => ({ ...current, [item.id]: choice }))}>{option}</button>)}</div>
    <footer><button className="button button-secondary" type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button><span>{Object.keys(answers).length} answered</span>{index < attempt.items.length - 1 ? <button className="button button-primary" type="button" onClick={() => setIndex(index + 1)}>Next</button> : <button className="button button-primary" type="button" onClick={() => void submit()}>Submit</button>}</footer>
    {error && <p className="form-error">{error}</p>}
  </div>;
}

export function PersonalityQuestionnaire() {
  const router = useRouter();
  const [attempt, setAttempt] = useState<{ id: string; items: { id: string; text: string }[] } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function start() {
    setDone(false); setAnswers({}); setNote("");
    const response = await fetch("/api/tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "personality" }) });
    const value = await response.json() as { attemptId: string; items: { id: string; text: string }[]; error?: string };
    if (!response.ok) { setError(value.error ?? "Could not start."); return; }
    setAttempt({ id: value.attemptId, items: value.items });
  }
  async function submit() {
    if (!attempt) return;
    const response = await fetch("/api/tests", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: attempt.id, answers, note }) });
    const value = await response.json() as { error?: string };
    if (!response.ok) { setError(value.error ?? "Could not submit."); return; }
    setDone(true); setAttempt(null); router.refresh();
  }
  if (!attempt) return <div><p className="empty-hint">30 statements drawn at random from a 50-statement public-domain pool, in a new order each time. Describe yourself as you generally are now, not as you wish to be. About 4 minutes.</p>{done && <p className="form-success">Saved. Your results are below.</p>}<button className="button button-primary" type="button" onClick={() => void start()}>Start questionnaire</button>{error && <p className="form-error">{error}</p>}</div>;
  return <div className="personality-form">
    {attempt.items.map((item, position) => <fieldset key={item.id}><legend>{position + 1}. I {item.text.charAt(0).toLowerCase()}{item.text.slice(1)}</legend><div className="likert">{SCALE.map((label, value) => <label key={label} className={answers[item.id] === value + 1 ? "selected" : ""}><input type="radio" name={item.id} checked={answers[item.id] === value + 1} onChange={() => setAnswers((current) => ({ ...current, [item.id]: value + 1 }))} />{label}</label>)}</div></fieldset>)}
    <label className="field"><span>In your own words (optional): anything the statements miss, e.g. &quot;I prefer objective decisions, but I do empathise; it depends on the stakeholders and the room&quot;</span><textarea rows={3} maxLength={800} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <button className="button button-primary" type="button" disabled={Object.keys(answers).length < attempt.items.length} onClick={() => void submit()}>Submit ({Object.keys(answers).length}/{attempt.items.length})</button>
    {error && <p className="form-error">{error}</p>}
  </div>;
}
