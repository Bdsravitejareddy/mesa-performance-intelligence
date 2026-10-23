"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Two kinds of context, kept apart: the problem statement you were given, and your own account of the work.
export function ProjectContextForm({ projectKey }: { projectKey: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"problem_statement" | "own_words">("own_words");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    form.set("projectKey", projectKey); form.set("kind", kind);
    const response = await fetch("/api/project-context", { method: "POST", body: form });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!response.ok) { setMessage(result.error ?? "Could not save."); return; }
    (event.target as HTMLFormElement).reset(); setMessage("Saved. It is evaluated in the next refresh.");
    router.refresh();
  }
  return <form className="project-context-form" onSubmit={(event) => void submit(event)}>
    <div className="segmented" role="radiogroup" aria-label="Kind of context">
      <button type="button" role="radio" aria-checked={kind === "own_words"} className={kind === "own_words" ? "active" : ""} onClick={() => setKind("own_words")}>In my own words</button>
      <button type="button" role="radio" aria-checked={kind === "problem_statement"} className={kind === "problem_statement" ? "active" : ""} onClick={() => setKind("problem_statement")}>Problem statement I was given</button>
    </div>
    <small className="empty-hint">{kind === "own_words" ? "What problem you saw, how you broke it down, what you decided and why. Counts as evidence of your communication, problem solving and first-principles reasoning." : "The brief or problem as it was handed to you. Used only as the standard the project is judged against — never as evidence of your communication."}</small>
    <input name="title" placeholder="Title (optional)" className="field-input" />
    <textarea name="text" rows={kind === "own_words" ? 7 : 4} placeholder={kind === "own_words" ? "Write it as you would explain it to an interviewer…" : "Paste the problem statement, or upload it below"} />
    {kind === "problem_statement" && <input type="file" name="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />}
    <div className="inline-action"><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save context"}</button>{message && <small role="status">{message}</small>}</div>
  </form>;
}

export function DeleteContext({ id }: { id: string }) {
  const router = useRouter();
  return <button type="button" className="text-button" onClick={async () => { await fetch(`/api/project-context?id=${id}`, { method: "DELETE" }); router.refresh(); }}>Remove</button>;
}
