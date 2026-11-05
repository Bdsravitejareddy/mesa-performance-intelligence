"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Lets the member say a released mark is not part of the course grade; it stays listed but leaves every average.
export function CountsTowardGrade({ assessmentId, counts }: { assessmentId: string; counts: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = async (next: boolean) => {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/assessments/${assessmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countsTowardGrade: next, note: next ? "" : "Marked by you as not part of the course grade." }) });
    setBusy(false);
    if (!response.ok) setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save.");
    else router.refresh();
  };
  return <label className="counts-toward-grade"><input type="checkbox" checked={counts} disabled={busy} onChange={(event) => void change(event.target.checked)} /> Counts toward the course grade{!counts && <small> — left out of standings and averages</small>}{error && <small role="alert"> {error}</small>}</label>;
}
