"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

// Starts the full server refresh: LMS, Drive matching and mapping, grading, GitHub, projects and readings.
export function RefreshEverything() {
  const [state, setState] = useState<"idle" | "busy" | "started" | "error">("idle");
  const [message, setMessage] = useState("");
  async function run() {
    setState("busy");
    const response = await fetch("/api/refresh", { method: "POST" });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setState("error"); setMessage(body.error ?? "Could not start."); return; }
    setState("started"); setMessage("Refreshing on the server — LMS, Drive, grading, GitHub and analyses. Results appear over the next 10–20 minutes; you can close this page.");
  }
  return <span className="inline-action"><button type="button" className="button button-light" onClick={() => void run()} disabled={state === "busy" || state === "started"}><RefreshCw size={14} className={state === "busy" ? "spin" : ""} /> {state === "started" ? "Refresh running" : "Refresh everything"}</button>{message && <small role="status">{message}</small>}</span>;
}
