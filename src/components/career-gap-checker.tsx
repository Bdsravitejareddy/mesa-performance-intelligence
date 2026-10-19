"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness } from "lucide-react";

export function CareerGapChecker() {
  const [role, setRole] = useState("");
  const [competencies, setCompetencies] = useState("");
  const [resume, setResume] = useState("");
  const gaps = useMemo(() => competencies.split(/[,\n]/).map((value) => value.trim()).filter(Boolean).map((competency) => ({ competency, found: resume.toLocaleLowerCase().includes(competency.toLocaleLowerCase()) })), [competencies, resume]);
  return <div className="career-tool"><div className="info-callout"><BriefcaseBusiness size={15} /> Enter role requirements from a source you trust. The browser checks phrase matches only; it does not verify skill or seniority.</div><label className="field"><span>Target role</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. Marketing analyst" /></label><label className="field"><span>Role competencies <small>(from a job description or standard)</small></span><textarea rows={4} value={competencies} onChange={(event) => setCompetencies(event.target.value)} placeholder="Market research, SQL, financial modelling" /></label><label className="field"><span>Resume text</span><textarea rows={8} value={resume} onChange={(event) => setResume(event.target.value)} placeholder="Paste resume text for a local phrase comparison. It is not saved or sent to a model." /></label>{role && <h3>{role}: phrase coverage</h3>}{gaps.length ? <div className="gap-list">{gaps.map((item) => <div className="gap-row" key={item.competency}><span className={item.found ? "gap-found" : "gap-missing"}>{item.found ? "Phrase found" : "Not found"}</span><strong>{item.competency}</strong>{!item.found && <small>Check for genuine evidence of this skill before adding it.</small>}</div>)}</div> : <div className="empty-copy"><p>Add role competencies and resume text to see phrase matches.</p></div>}<p className="scope-note">A missing phrase is not proof of a skill gap, and a match is not proof of competency. Add source references and course evidence before interpreting readiness.</p><span className="text-link">Build evidence from assessments <ArrowRight size={14} /></span></div>;
}
