"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { inspectSubmissionQuality } from "@/lib/quality";

export function QualityChecker() {
  const [text, setText] = useState("");
  const report = useMemo(() => inspectSubmissionQuality(text), [text]);
  return <div className="quality-tool"><label className="field"><span>Paste a draft or calculation steps</span><textarea value={text} onChange={(event) => setText(event.target.value)} rows={12} maxLength={100000} placeholder="Paste the text you want to check. This local preview is not saved or sent to a model." /></label><div className="quality-summary"><ClipboardCheck size={16} /><strong>{report.wordCount} words</strong><span>Local checks only · draft not saved</span></div><div className="quality-findings">{report.findings.map((finding) => <article className="quality-finding" key={`${finding.title}-${finding.detail}`}><span className={`quality-level ${finding.level}`}>{finding.level}</span><div><strong>{finding.title}</strong><p>{finding.detail}</p></div></article>)}</div><p className="scope-note">{report.scopeNote}</p></div>;
}
