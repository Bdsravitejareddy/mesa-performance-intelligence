"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Confirms, then detaches a file the grader flagged as a different piece of work.
export function DetachFile({ submissionId, documentId, name }: { submissionId: string; documentId: string; name: string }) {
  const router = useRouter();
  const [state, setState] = useState("");
  async function detach() {
    if (!window.confirm(`Detach “${name}” from this assessment? Its grade is removed, and the file stays in your Drive.`)) return;
    setState("Detaching…");
    const response = await fetch("/api/gradings/detach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ submissionId, documentId }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setState(response.ok ? "Detached." : body.error ?? "Could not detach.");
    if (response.ok) router.refresh();
  }
  return <span className="inline-action"><button type="button" className="button button-secondary" onClick={() => void detach()}>Detach “{name.slice(0, 50)}”</button>{state && <small role="status">{state}</small>}</span>;
}
