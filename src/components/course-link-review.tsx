"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link2, Link2Off } from "lucide-react";

type Course = { id: string; title: string; detail: string };
type Pair = { material: Course; assessment: Course };

export function CourseLinkReview({ suggestions, links, unlinkedMaterial, assessmentCourses }: { suggestions: Pair[]; links: Pair[]; unlinkedMaterial: Course[]; assessmentCourses: Course[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});

  async function send(method: "POST" | "DELETE", body: Record<string, string>, key: string) {
    setBusy(key);
    setStatus("");
    try {
      const response = await fetch("/api/course-links", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update the link.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update the link.");
    } finally {
      setBusy("");
    }
  }
  const link = (pair: { materialId: string; assessmentId: string }) => send("POST", { assessmentCourseId: pair.assessmentId, materialCourseId: pair.materialId }, pair.materialId);
  const suggestedIds = new Set(suggestions.map((pair) => pair.material.id));
  const manualOnly = unlinkedMaterial.filter((course) => !suggestedIds.has(course.id));

  return <div className="course-link-review">
    {status && <p className="info-callout data-quality-warning" role="status">{status}</p>}
    {suggestions.length > 0 && <>
      <h3>Suggested links <span className="panel-count">{suggestions.length}</span></h3>
      <p className="empty-hint">Matched by course name only. Confirm each one you recognise; nothing is linked until you do.</p>
      <div className="link-list">{suggestions.map((pair) => <div className="link-row" key={pair.material.id}>
        <span><strong>{pair.material.title}</strong><small>{pair.material.detail}</small></span>
        <span className="link-arrow" aria-hidden>→</span>
        <span><strong>{pair.assessment.title}</strong><small>{pair.assessment.detail}</small></span>
        <button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={() => link({ materialId: pair.material.id, assessmentId: pair.assessment.id })}><Link2 size={13} />{busy === pair.material.id ? "Linking…" : "Confirm link"}</button>
      </div>)}</div>
      {suggestions.length > 1 && <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={async () => { for (const pair of suggestions) await link({ materialId: pair.material.id, assessmentId: pair.assessment.id }); }}>Confirm all {suggestions.length} suggestions</button>}
    </>}
    {manualOnly.length > 0 && <>
      <h3>No confident match <span className="panel-count">{manualOnly.length}</span></h3>
      <div className="link-list">{manualOnly.map((course) => <div className="link-row" key={course.id}>
        <span><strong>{course.title}</strong><small>{course.detail}</small></span>
        <span className="link-arrow" aria-hidden>→</span>
        <select aria-label={`LMS course for ${course.title}`} value={manual[course.id] ?? ""} onChange={(event) => setManual((current) => ({ ...current, [course.id]: event.target.value }))}><option value="">Choose a course</option>{assessmentCourses.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select>
        <button className="button button-secondary" type="button" disabled={!manual[course.id] || Boolean(busy)} onClick={() => link({ materialId: course.id, assessmentId: manual[course.id] })}><Link2 size={13} />Link</button>
      </div>)}</div>
    </>}
    {links.length > 0 && <>
      <h3>Linked <span className="panel-count">{links.length}</span></h3>
      <div className="link-list">{links.map((pair) => <div className="link-row" key={pair.material.id}>
        <span><strong>{pair.material.title}</strong><small>{pair.material.detail}</small></span>
        <span className="link-arrow" aria-hidden>→</span>
        <span><strong>{pair.assessment.title}</strong><small>{pair.assessment.detail}</small></span>
        <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => send("DELETE", { materialCourseId: pair.material.id }, pair.material.id)}><Link2Off size={13} />{busy === pair.material.id ? "Removing…" : "Unlink"}</button>
      </div>)}</div>
    </>}
    {!suggestions.length && !manualOnly.length && !links.length && <p className="empty-hint">No Drive material courses need linking.</p>}
  </div>;
}
