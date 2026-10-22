"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Flame, Plus, Sparkles, Trophy, X } from "lucide-react";

type Task = { id: string; title: string; source: "self" | "suggested"; reason: string; done_at: string | null };
type State = { week: string; tasks: Task[]; history: { week: string; done: number; total: number }[]; points: number; streak: number; level: number; toNextLevel: number };
type Suggestion = { title: string; reason: string };

function greeting(hour: number) {
  return hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

// Five tasks a week, ticked off for points; suggestions come from the roadmap and the overview summary.
export function WeeklyQuest({ name, suggestions }: { name: string; suggestions: Suggestion[] }) {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    void fetch("/api/weekly-tasks").then((response) => (response.ok ? response.json() : null)).then((value) => value && setState(value));
    return () => window.clearInterval(timer);
  }, []);

  const call = async (input: string, init: RequestInit) => {
    setError("");
    const response = await fetch(input, { ...init, headers: { "content-type": "application/json" } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError((body as { error?: string }).error ?? "Something went wrong."); return null; }
    setState(body as State);
    return body as State;
  };

  const done = state?.tasks.filter((task) => task.done_at).length ?? 0;
  const total = state?.tasks.length ?? 0;
  const daysLeft = now ? 7 - ((now.getDay() + 6) % 7) : null;
  const open = useMemo(() => suggestions.filter((item) => !state?.tasks.some((task) => task.title.toLowerCase() === item.title.toLowerCase())), [suggestions, state]);

  const toggle = async (task: Task) => {
    const next = await call("/api/weekly-tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, done: !task.done_at }) });
    if (next && next.tasks.length === 5 && next.tasks.every((item) => item.done_at)) setBurst((value) => value + 1);
  };
  const add = async (title: string, source: "self" | "suggested", reason = "") => {
    if (await call("/api/weekly-tasks", { method: "POST", body: JSON.stringify({ title, source, reason }) })) setDraft("");
  };
  const fill = async () => { for (const item of open.slice(0, 5 - total)) await add(item.title, "suggested", item.reason); };

  const circumference = 2 * Math.PI * 30;
  return <section className="quest" aria-label="This week's plan">
    <header className="quest-head">
      <div>
        <span className="eyebrow"><span className="eyebrow-line" /> {now ? now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "This week"}</span>
        <h2>{now ? greeting(now.getHours()) : "Hello"}, {name}.</h2>
        <p>{total === 0 ? "Pick five things to move this week." : done === total && total === 5 ? "All five done. That is a perfect week." : `${done} of ${total} done${daysLeft !== null ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left this week` : ""}.`}</p>
      </div>
      <div className="quest-stats">
        <span className="quest-ring" aria-label={`${done} of 5 done`}><svg viewBox="0 0 70 70"><circle cx="35" cy="35" r="30" className="ring-track" /><circle cx="35" cy="35" r="30" className="quest-ring-value" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - done / 5) }} /></svg><b>{done}<small>/5</small></b></span>
        <span className="quest-stat"><Trophy size={15} /><b>{state?.points ?? 0}</b><small>points · level {state?.level ?? 1}</small></span>
        <span className="quest-stat"><Flame size={15} /><b>{state?.streak ?? 0}</b><small>week streak</small></span>
      </div>
    </header>
    <div className="quest-level" aria-hidden="true"><i style={{ width: `${100 - (state?.toNextLevel ?? 100)}%` }} /></div>
    <ul className="quest-list">
      {state?.tasks.map((task) => <li key={task.id} className={task.done_at ? "is-done" : ""}>
        <button type="button" className="quest-check" aria-label={task.done_at ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`} onClick={() => void toggle(task)}>{task.done_at && <Check size={14} strokeWidth={3} />}</button>
        <span className="quest-title"><strong>{task.title}</strong>{task.reason && <small>{task.reason}</small>}</span>
        {task.source === "suggested" && <em className="quest-tag"><Sparkles size={11} /> suggested</em>}
        <button type="button" className="quest-remove" aria-label={`Remove “${task.title}”`} onClick={() => void call(`/api/weekly-tasks?id=${task.id}`, { method: "DELETE" })}><X size={13} /></button>
      </li>)}
    </ul>
    {total < 5 && <div className="quest-add">
      <form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) void add(draft.trim(), "self"); }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add your own task for this week…" maxLength={200} /><button type="submit" className="button button-light" disabled={!draft.trim()}><Plus size={14} /> Add</button></form>
      {open.length > 0 && <button type="button" className="button" onClick={() => void fill()}><Sparkles size={14} /> Suggest {Math.min(open.length, 5 - total)}</button>}
    </div>}
    {total < 5 && open.length > 0 && <div className="quest-suggestions">{open.slice(0, 5 - total).map((item) => <button type="button" key={item.title} onClick={() => void add(item.title, "suggested", item.reason)} title={item.reason}><Plus size={12} /> {item.title}</button>)}</div>}
    {error && <p className="form-error">{error}</p>}
    {burst > 0 && <div className="confetti" key={burst} aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ ["--x" as string]: `${(index * 37) % 100}%`, ["--d" as string]: `${(index % 7) * 0.06}s`, ["--h" as string]: `${(index * 53) % 360}` }} />)}</div>}
  </section>;
}
