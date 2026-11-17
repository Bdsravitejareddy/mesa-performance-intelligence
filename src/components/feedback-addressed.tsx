"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// One row can stand for the same comment from several sources, so it marks all of them at once.
export function FeedbackAddressed({ ids, addressed }: { ids: string[]; addressed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await fetch("/api/feedback", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, addressed: !addressed }) }).catch(() => null);
    setBusy(false);
    router.refresh();
  };
  return <button type="button" className="text-link feedback-toggle" onClick={toggle} disabled={busy} aria-pressed={addressed}>{addressed ? "Mark open again" : "Mark addressed"}</button>;
}
