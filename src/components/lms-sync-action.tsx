"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

type SyncResponse = { status?: string; marks?: number; feedback?: number; assessments?: number; error?: string; message?: string };

export function LmsSyncAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function sync() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/lms-sync", { method: "POST" });
      const result = await response.json() as SyncResponse;
      if (!response.ok) throw new Error(result.error || "LMS sync failed.");
      setMessage(result.status === "partial" ? result.message || "Sync needs review." : `Synced ${result.assessments ?? 0} assessments, ${result.marks ?? 0} marks, and ${result.feedback ?? 0} feedback records.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LMS sync failed.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="lms-sync-action"><button className="button button-secondary" type="button" onClick={sync} disabled={busy}><RefreshCw size={13} className={busy ? "spin" : ""} />{busy ? "Syncing…" : "Sync Mesa LMS now"}</button>{message && <p role="status">{message}</p>}</div>;
}
