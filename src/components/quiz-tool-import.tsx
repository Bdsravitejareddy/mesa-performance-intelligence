"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Records one Quiz Tool session as read from "My scores". Missed questions: one per line, as
// "question | your answer | correct answer".
export function QuizToolImport() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const missed = String(form.get("missed") ?? "").split("\n").map((line) => line.split("|").map((part) => part.trim())).filter(([question]) => question).map(([question, yourAnswer = "", correctAnswer = ""]) => ({ question, yourAnswer, correctAnswer }));
    const response = await fetch("/api/imports/quiz-tool", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ course: form.get("course"), term: form.get("term"), session: form.get("session"), correct: Number(form.get("correct")), total: Number(form.get("total")), shown: form.get("shown"), note: form.get("note"), missed }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    setMessage(response.ok ? "Saved." : body.error ?? "Could not save.");
    if (response.ok) router.refresh();
  };
  return <form className="content-panel quiz-tool-form" onSubmit={submit}>
    <h2>Add a session</h2>
    <div className="quiz-tool-fields">
      <label className="field"><span>Course</span><input name="course" required maxLength={120} placeholder="Data 102" /></label>
      <label className="field"><span>Term</span><input name="term" maxLength={40} placeholder="Term 2" /></label>
      <label className="field"><span>Session</span><input name="session" required maxLength={60} placeholder="Session 2" /></label>
      <label className="field"><span>Correct (distinct questions)</span><input name="correct" type="number" min={0} required /></label>
      <label className="field"><span>Asked (distinct questions)</span><input name="total" type="number" min={1} required /></label>
      <label className="field"><span>As the tool shows it</span><input name="shown" maxLength={40} placeholder="14 / 20" /></label>
    </div>
    <label className="field"><span>Missed questions (one per line: question | your answer | correct answer)</span><textarea name="missed" rows={4} /></label>
    <label className="field"><span>Note</span><input name="note" maxLength={400} /></label>
    <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save session"}</button>
    {message && <p className="scope-note" role="status">{message}</p>}
  </form>;
}
