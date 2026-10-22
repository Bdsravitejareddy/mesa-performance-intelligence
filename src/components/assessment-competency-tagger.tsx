"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatOfficialMark } from "@/lib/scoring";

type Competency = { id: string; domain: string; name: string };
type Assessment = { id: string; title: string; course: string; tagged: string[]; locked: string[]; mark: number | null; criteria: { label: string; score: number; max: number }[]; criterionTags: Record<string, string> };

export function AssessmentCompetencyTagger({ competencies, assessments }: { competencies: Competency[]; assessments: Assessment[] }) {
  const [filter, setFilter] = useState("");
  const visible = assessments.filter((item) => `${item.title} ${item.course}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const byDomain = useMemo(() => {
    const groups = new Map<string, Competency[]>();
    for (const item of competencies) groups.set(item.domain, [...(groups.get(item.domain) ?? []), item]);
    return [...groups.entries()];
  }, [competencies]);
  return <div className="competency-tagger">
    <label className="field"><span>Filter assessments</span><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Course or assessment title" /></label>
    {visible.map((assessment) => <AssessmentTags key={assessment.id} assessment={assessment} byDomain={byDomain} names={new Map(competencies.map((item) => [item.id, item.name]))} />)}
    {!visible.length && <p className="empty-hint">No assessments match.</p>}
  </div>;
}

function AssessmentTags({ assessment, byDomain, names }: { assessment: Assessment; byDomain: [string, Competency[]][]; names: Map<string, string> }) {
  const router = useRouter();
  const [selected, setSelected] = useState(new Set(assessment.tagged));
  const [criterionTags, setCriterionTags] = useState<Record<string, string>>(assessment.criterionTags);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const criterionDirty = assessment.criteria.some((item) => (criterionTags[item.label] ?? "") !== (assessment.criterionTags[item.label] ?? ""));
  const dirty = criterionDirty || selected.size !== assessment.tagged.length || assessment.tagged.some((id) => !selected.has(id));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/assessment-competencies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: assessment.id, competencyIds: [...selected], criteria: Object.entries(criterionTags).filter(([, competencyId]) => competencyId).map(([label, competencyId]) => ({ label, competencyId })) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save.");
      setStatus("Saved.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const criterionCount = Object.values(criterionTags).filter(Boolean).length;
  const summary = [[...selected, ...assessment.locked].map((id) => names.get(id)).filter(Boolean).join(", "), criterionCount ? `${criterionCount} criterion tag${criterionCount > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  return <details className="tagger-row">
    <summary><span><strong>{assessment.title}</strong><small>{assessment.course} · {assessment.mark === null ? "no released mark" : formatOfficialMark(assessment.mark)}</small></span><small className="tagger-summary">{summary || "Not mapped"}</small></summary>
    <div className="tagger-body">
      {byDomain.map(([domain, items]) => <fieldset key={domain}><legend>{domain}</legend>{items.map((item) => {
        const locked = assessment.locked.includes(item.id);
        return <label key={item.id} className="tagger-option"><input type="checkbox" checked={locked || selected.has(item.id)} disabled={locked || busy} onChange={() => toggle(item.id)} />{item.name}{locked && <small> (official)</small>}</label>;
      })}</fieldset>)}
      {assessment.criteria.length > 0 && <fieldset className="tagger-criteria"><legend>Criterion-level mapping (from official feedback)</legend>
        <small>Tag a criterion when it tests one competency. Criterion marks are direct evidence and replace the whole-assessment mark for that competency.</small>
        {assessment.criteria.map((item) => <label key={item.label} className="tagger-criterion"><span>{item.label} <small>{item.score}/{item.max}</small></span><select value={criterionTags[item.label] ?? ""} disabled={busy} onChange={(event) => setCriterionTags((current) => ({ ...current, [item.label]: event.target.value }))}><option value="">Not mapped</option>{byDomain.map(([domain, items]) => <optgroup key={domain} label={domain}>{items.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</optgroup>)}</select></label>)}
      </fieldset>}
      <div className="tagger-actions"><button className="button button-primary" type="button" onClick={save} disabled={!dirty || busy || selected.size > 12}>{busy ? "Saving…" : "Save mapping"}</button>{selected.size > 12 && <small>Choose at most 12.</small>}{status && <small role="status">{status}</small>}</div>
    </div>
  </details>;
}

// Maps every untagged assessment with Gemini; mappings are labelled AI-mapped and can be unticked below.
export function AutoTagButton({ untagged }: { untagged: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run() {
    setBusy(true); setMessage("Mapping assessments with Gemini…");
    try {
      const response = await fetch("/api/assessment-competencies/auto", { method: "POST" });
      const result = await response.json() as { error?: string; assessments?: number; accepted?: number; suggested?: number; criteria?: number };
      if (!response.ok) throw new Error(result.error ?? "Auto-mapping failed.");
      setMessage(`Mapped ${result.assessments} assessments: ${result.accepted} competency links applied, ${result.criteria} criterion links, ${result.suggested} low-confidence suggestions held back.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Auto-mapping failed."); }
    finally { setBusy(false); }
  }
  if (!untagged) return null;
  return <div className="info-callout describe-action"><span>{untagged} assessment{untagged === 1 ? " is" : "s are"} not mapped. Gemini can map them from their titles, criteria and feedback; each mapping keeps its reason and can be unticked.</span><button className="button button-primary" type="button" disabled={busy} onClick={() => void run()}>{busy ? "Mapping…" : "Map assessments automatically"}</button>{message && <small role="status">{message}</small>}</div>;
}
