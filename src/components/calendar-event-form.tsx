"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, X } from "lucide-react";

const KINDS = [["hackathon", "Hackathon"], ["competition", "Competition"], ["exam", "Exam"], ["interview", "Interview"], ["deadline", "Deadline"], ["event", "Other event"]] as const;

// Adds a hackathon, competition or other event to the calendar. Times are India time.
export function CalendarEventForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/calendar-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(["title", "kind", "startsAt", "endsAt", "link", "note"].map((key) => [key, form.get(key)]))) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not add the event.");
      formElement.reset(); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add the event."); }
    finally { setBusy(false); }
  }
  return <form className="calendar-event-form" onSubmit={submit}>
    <label className="field"><span>What</span><input name="title" required maxLength={200} placeholder="e.g. Flipkart GRiD hackathon round 1" /></label>
    <label className="field"><span>Type</span><select name="kind" defaultValue="hackathon">{KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="field"><span>Starts (India time)</span><input name="startsAt" type="datetime-local" required /></label>
    <label className="field"><span>Ends (optional)</span><input name="endsAt" type="datetime-local" /></label>
    <label className="field"><span>Link (optional)</span><input name="link" type="url" pattern="https://.*" maxLength={1000} placeholder="https://" /></label>
    <label className="field"><span>Note (optional)</span><input name="note" maxLength={1000} /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Add to calendar</button>
  </form>;
}

export function RemoveCalendarEvent({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="calendar-remove" aria-label={`Remove ${title}`} title="Remove" disabled={busy} onClick={async () => {
    setBusy(true);
    await fetch(`/api/calendar-events?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    setBusy(false); router.refresh();
  }}><X size={12} /></button>;
}
