"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play } from "lucide-react";

type Outcome = { assessment: string; status: string; note: string };

export function RunGrading({ submissionId, label = "Grade now" }: { submissionId?: string; label?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const run = async () => {
    setState("running");
    setMessage("Grading against your course material — this can take a few minutes…");
    try {
      const response = await fetch("/api/gradings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submissionId ? { submissionId } : {}) });
      const body = (await response.json().catch(() => ({}))) as { outcomes?: Outcome[]; error?: string; continuing?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Grading failed.");
      const outcomes = body.outcomes ?? [];
      const count = (status: string) => outcomes.filter((row) => row.status === status).length;
      setMessage(outcomes.length ? `${count("graded")} graded by AI and code, ${count("code_only")} by code only, ${count("unchanged")} unchanged, ${count("skipped")} waiting.${body.continuing ? " The rest continues on the server — you can close this page." : ""}` : "Nothing to grade yet: no submitted work has been found.");
      setState("done");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Grading failed.");
      setState("error");
    }
  };
  return <div className="run-grading">
    <button type="button" className="button button-primary" onClick={run} disabled={state === "running"}><Play size={14} /> {state === "running" ? "Grading…" : label}</button>
    {message && <span className={`run-grading-note${state === "error" ? " is-error" : ""}`} role="status">{message}</span>}
  </div>;
}
