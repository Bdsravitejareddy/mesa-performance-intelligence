"use client";

import { useEffect, useState } from "react";
import type { PracticeItem } from "@/lib/practice/week";

type Result = { questions: { id: string; kind: string; correct: boolean; key: string; explanation: string }[]; correct: number; total: number; written: { id: string; kind: string; words: number; distinctShare: number; avgSentence: number; longWords: number }[]; feedback: Record<string, string> };

// This week's practice: quiz and trick questions, a short case task and two everyday prompts.
export function WeeklyPractice() {
  const [data, setData] = useState<{ week: string; focus: string; items: PracticeItem[]; answers: Record<string, unknown>; result: Result | null; submitted: boolean } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [state, setState] = useState("");
  useEffect(() => { void fetch("/api/practice").then((response) => response.json()).then((body) => { if (body.items) { setData(body); setAnswers(body.answers ?? {}); } else setState(body.error ?? "Could not load."); }); }, []);
  if (!data) return <p className="empty-hint">{state || "Loading this week's practice…"}</p>;
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
    <p className="empty-hint">Week of {new Date(data.week).toLocaleDateString(undefined, { day: "numeric", month: "long" })}. The case task targets your lowest skill in the AI view ({data.focus}). Practice is ungraded and weighted as practice.</p>
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
      : result && <p className="info-callout"><span><b>{result.correct} of {result.total}</b> questions right this week. A new set arrives on Monday.</span></p>}
  </div>;
}
