"use client";

import { useEffect, useState } from "react";
import type { PracticeItem } from "@/lib/practice/week";

type Result = { seconds?: number; overtime?: boolean; questions: { id: string; kind: string; correct: boolean; key: string; explanation: string }[]; correct: number; total: number; written: { id: string; kind: string; words: number; distinctShare: number; avgSentence: number; longWords: number }[]; feedback: Record<string, string> };

// This week's practice: quiz and trick questions, a short case task and two everyday prompts.
export function WeeklyPractice() {
  const [data, setData] = useState<{ week: string; focus: string; course?: string; items: PracticeItem[]; answers: Record<string, unknown>; result: Result | null; submitted: boolean; started?: boolean; focusReason?: string; outline?: { id: string; kind: string }[]; startedAt?: string | null; timeLimit?: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [state, setState] = useState("");
  const load = () => fetch("/api/practice").then((response) => response.json()).then((body) => { if (body.items) { setData(body); setAnswers(body.answers ?? {}); } else setState(body.error ?? "Could not load."); });
  useEffect(() => { void load(); }, []);
  async function start() { setState("Starting…"); await fetch("/api/practice", { method: "POST" }); setState(""); await load(); }
  const deadline = data?.startedAt && data.timeLimit ? new Date(data.startedAt).getTime() + data.timeLimit * 1000 : null;
  const remaining = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null;
  // When time runs out, the answers so far are submitted (time over the limit is recorded on the server too).
  useEffect(() => { if (data && !data.submitted && remaining === 0 && !state) void submit(); });
  if (!data) return <p className="empty-hint">{state || "Preparing this week's practice from your course material — this can take a minute the first time…"}</p>;
  if (!data.started && !data.submitted) return <div className="content-panel practice-start">
    <h2>Ready when you are</h2>
    {data.focusReason && <p className="practice-why"><b>Why this week:</b> {data.focusReason}</p>}
    <p>{data.outline?.filter((item) => item.kind === "quiz" || item.kind === "trick").length ?? 5} extreme questions{data.course ? <> from <b>{data.course.replace(/\s+with\s+.*$/i, "")}</b></> : ""}, a case task and two everyday prompts. You have {Math.round((data.timeLimit ?? 1500) / 60)} minutes once you start; answers so far are submitted when time runs out.</p>
    <button type="button" className="button button-primary" onClick={() => void start()}>Start the {Math.round((data.timeLimit ?? 1500) / 60)}-minute practice</button>{state && <small role="status">{state}</small>}
  </div>;
  const result = data.result;
  async function submit() {
    setState("Checking your answers…");
    const response = await fetch("/api/practice", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
    const body = await response.json().catch(() => ({})) as { result?: Result; error?: string };
    if (!response.ok || !body.result) { setState(body.error ?? "Could not submit."); return; }
    setData({ ...data!, result: body.result, submitted: true }); setState("");
  }
  const label = { quiz: "Quiz", trick: "Trick question", case: `Case task · ${data.focus}`, conversation: "Conversation" } as const;
  return <div className="practice">
    <div className="practice-head"><p className="empty-hint">Week of {new Date(data.week).toLocaleDateString(undefined, { day: "numeric", month: "long" })} · {data.course ? <>questions from <b>{data.course.replace(/\s+with\s+.*$/i, "")}</b>, chosen for {data.focus}</> : <>extreme reasoning questions (course questions need AI consent and course material)</>}. Every question is checked twice against the course material before it is used.</p>
      {!data.submitted && remaining !== null && <span className={`test-clock${remaining < 120 ? " urgent" : ""}`} aria-live="polite">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span>}</div>
    {data.items.map((item, index) => {
      const outcome = result?.questions.find((row) => row.id === item.id);
      const stats = result?.written.find((row) => row.id === item.id);
      return <article key={item.id} className={`content-panel practice-item${outcome ? (outcome.correct ? " is-correct" : " is-wrong") : ""}`}>
        <span className="eyebrow">{index + 1} · {label[item.kind]}</span>
        <p className="practice-prompt">{item.prompt}</p>
        {"options" in item ? <div className="test-options">{item.options.map((option, choice) => <button key={option} type="button" disabled={data.submitted} className={answers[item.id] === choice ? "selected" : ""} onClick={() => setAnswers({ ...answers, [item.id]: choice })}>{option}</button>)}</div>
          : <textarea rows={item.kind === "case" ? 7 : 5} disabled={data.submitted} value={String(answers[item.id] ?? "")} placeholder={`At least ${item.minWords} words`} onChange={(event) => setAnswers({ ...answers, [item.id]: event.target.value })} />}
        {outcome && <p className="practice-outcome"><b>{outcome.correct ? "Correct." : `The answer is: ${outcome.key}.`}</b> {outcome.explanation}</p>}
        {stats && <p className="practice-outcome"><b>{stats.words} words</b> · vocabulary range {Math.round(stats.distinctShare * 100)}% distinct · {stats.avgSentence} words per sentence · {stats.longWords} long words{item.kind === "case" && result?.feedback.case ? <><br />{result.feedback.case}</> : null}</p>}
      </article>;
    })}
    {!data.submitted ? <div className="inline-action"><button type="button" className="button button-primary" onClick={() => void submit()}>Submit this week</button>{state && <small role="status">{state}</small>}</div>
      : result && <p className="info-callout"><span><b>{result.correct} of {result.total}</b> questions right this week{result.seconds ? `, in ${Math.round(result.seconds / 60)} minutes` : ""}{result.overtime ? " (over the time limit)" : ""}. A new set arrives on Monday.</span></p>}
  </div>;
}
