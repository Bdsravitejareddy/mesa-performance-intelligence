"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

// Re-reads personality from the member's written context (note, assistant profiles, observed patterns).
export function ContextReadingRefresh({ hasReading }: { hasReading: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  async function run() {
    setState("busy"); setMessage("");
    const response = await fetch("/api/personality-reading", { method: "POST" });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setState("error"); setMessage(body.error ?? "The reading failed."); return; }
    setState("idle"); router.refresh();
  }
  return <span className="inline-action"><button type="button" className="button button-light" onClick={() => void run()} disabled={state === "busy"}><RefreshCw size={14} className={state === "busy" ? "spin" : ""} /> {state === "busy" ? "Reading your context…" : hasReading ? "Re-read my context" : "Read my context"}</button>{message && <small className="form-error">{message}</small>}</span>;
}
