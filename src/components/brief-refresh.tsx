"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function BriefRefresh({ term, hasBrief }: { term: string; hasBrief: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  const run = async () => {
    setState("busy"); setMessage("");
    const response = await fetch("/api/overview-brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ term }) });
    const body = await response.json().catch(() => ({})) as { error?: string; status?: string };
    if (!response.ok) { setState("error"); setMessage(body.error ?? "Could not generate the summary."); return; }
    setState("idle"); setMessage(body.status === "reused" ? "Already up to date." : "");
    router.refresh();
  };
  return <span className="brief-refresh">
    <button type="button" className="button button-light" onClick={run} disabled={state === "busy"}><RefreshCw size={14} className={state === "busy" ? "spin" : ""} /> {state === "busy" ? "Writing…" : hasBrief ? "Refresh summary" : "Write my summary"}</button>
    {message && <small className={state === "error" ? "form-error" : ""}>{message}</small>}
  </span>;
}
