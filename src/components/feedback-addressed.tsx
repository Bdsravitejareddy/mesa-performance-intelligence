"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FeedbackAddressed({ id, addressed }: { id: string; addressed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await fetch("/api/feedback", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, addressed: !addressed }) }).catch(() => null);
    setBusy(false);
    router.refresh();
  };
  return <button type="button" className="text-link feedback-toggle" onClick={toggle} disabled={busy} aria-pressed={addressed}>{addressed ? "Mark open again" : "Mark addressed"}</button>;
}
