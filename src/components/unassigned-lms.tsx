"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Held = { id: string; title: string; detail: string; suggestedCourseId: string | null; basis: string; resolvedCourse: string | null; resolution: string | null };

export function UnassignedLmsList({ items, courses }: { items: Held[]; courses: { id: string; title: string }[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Record<string, string>>(Object.fromEntries(items.map((item) => [item.id, item.suggestedCourseId ?? ""])));
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function confirm(id: string) {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch("/api/lms/unassigned", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, courseId: choice[id] }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }
  return <div className="link-list">
    {message && <p className="info-callout data-quality-warning" role="status">{message}</p>}
    {items.map((item) => <div className="link-row" key={item.id}>
      <span><strong>{item.title}</strong><small>{item.detail}</small>{item.basis && <small>{item.basis}</small>}</span>
      <span className="link-arrow" aria-hidden>→</span>
      {item.resolvedCourse ? <span><strong>{item.resolvedCourse}</strong><small>{item.resolution === "member" ? "Confirmed by a member" : "Filed automatically from the title"}</small></span> : <select aria-label={`Course for ${item.title}`} value={choice[item.id] ?? ""} onChange={(event) => setChoice((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose the course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>}
      {!item.resolvedCourse && <button className="button button-secondary" type="button" disabled={!choice[item.id] || Boolean(busy)} onClick={() => confirm(item.id)}>{busy === item.id ? "Filing…" : "File under course"}</button>}
    </div>)}
  </div>;
}
