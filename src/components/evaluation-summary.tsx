import { BookOpenCheck, FileText } from "lucide-react";

export type SummaryReference = { key: string; label: string };
export type EvaluationSummaryItem = {
  title: string;
  detail: string;
  sourceRefs: string[];
  confidence: "high" | "medium" | "low" | "insufficient";
  whatStudentDid?: string;
  courseExpectation?: string;
  whyIncomplete?: string;
  illustrativeExample?: string;
  rubricAlignment?: string;
  professionalApplication?: string;
};
export type EvaluationSummaryData = { strengths: EvaluationSummaryItem[]; improvements: EvaluationSummaryItem[]; actions: EvaluationSummaryItem[] };
export type EvaluationDocument = { id: string; name: string; sourceKind: string; extractionStatus: string; sourceVersion: string };

export function isEvaluationSummaryData(value: unknown): value is EvaluationSummaryData {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return (["strengths", "improvements", "actions"] as const).every((section) => Array.isArray(raw[section]) && (raw[section] as unknown[]).every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Record<string, unknown>;
    return typeof item.title === "string" && typeof item.detail === "string" && Array.isArray(item.sourceRefs) && item.sourceRefs.every((reference) => typeof reference === "string") && ["high", "medium", "low", "insufficient"].includes(String(item.confidence));
  }));
}

export function getSummaryReferences(value: unknown): SummaryReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).key === "string" && typeof (item as Record<string, unknown>).label === "string" ? [{ key: (item as Record<string, string>).key, label: (item as Record<string, string>).label }] : []);
}

export function EvaluationSummary({ submissionId, summary, sourceReferences, sampleCount, sampleLabel, documents, attachmentsUnavailable = true }: {
  submissionId: string;
  summary: EvaluationSummaryData | null;
  sourceReferences: SummaryReference[];
  sampleCount: number;
  sampleLabel?: string;
  documents: EvaluationDocument[];
  attachmentsUnavailable?: boolean;
}) {
  const labels = new Map(sourceReferences.map((reference) => [reference.key, reference.label]));
  return <section className="evaluation-summary" aria-label="Evidence-linked assessment summary">
    <div className="summary-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> EVIDENCE-LINKED FEEDBACK</span><h3>Assessment summary</h3></div><span className="summary-sample">{sampleLabel ?? (sampleCount === 1 ? "One assessment observation" : `${sampleCount} linked assessment${sampleCount === 1 ? "" : "s"}`)}</span></div>
    {summary ? <div className="summary-sections">
      <SummarySection title="What you do well" items={summary.strengths} labels={labels} empty="No supported strengths were returned." />
      <SummarySection title="What to improve next" items={summary.improvements} labels={labels} empty="No supported improvement findings were returned." improvements />
      <SummarySection title="What to do now" items={summary.actions} labels={labels} empty="No evidence-linked next actions were returned." />
    </div> : <p className="summary-empty">No evaluation summary is saved for this submission yet. Add the submitted work, relevant course material, and an official or approved rubric before evaluating it.</p>}
    {documents.length > 0 && <div className="summary-documents"><strong><FileText size={14} /> Submission document provenance</strong>{documents.map((document) => <div key={document.id}><span>{document.name}</span><small>{document.sourceKind.replaceAll("_", " ")} · {document.sourceVersion} · extraction {document.extractionStatus.replaceAll("_", " ")}</small></div>)}</div>}
    {documents.length === 0 && attachmentsUnavailable && <div className="summary-attachment-state"><p>The LMS connector does not expose submitted attachment content. No file has been read or inferred from its link.</p><a href={`#submission-files-${encodeURIComponent(submissionId)}`}><FileText size={14} /> Upload a PDF or PPTX <span>or link indexed course material</span></a></div>}
  </section>;
}

function SummarySection({ title, items, labels, empty, improvements = false }: { title: string; items: EvaluationSummaryItem[]; labels: Map<string, string>; empty: string; improvements?: boolean }) {
  return <section className="summary-section"><h4>{title}</h4>{items.length ? items.map((item, index) => <article className="summary-item" key={`${item.title}-${index}`}>
    <div className="summary-item-title"><strong>{item.title}</strong><span>Confidence: {item.confidence}</span></div><p>{item.detail}</p>
    {improvements && <dl className="summary-improvement"><div><dt>What you did</dt><dd>{item.whatStudentDid || "Not specified in the saved evaluation."}</dd></div><div><dt>Course expectation</dt><dd>{item.courseExpectation || "Not specified in the saved evaluation."}</dd></div><div><dt>Why incomplete</dt><dd>{item.whyIncomplete || "Not specified in the saved evaluation."}</dd></div>{item.illustrativeExample && <div><dt>Example (illustrative)</dt><dd>{item.illustrativeExample}</dd></div>}{item.rubricAlignment && <div><dt>Rubric alignment</dt><dd>{item.rubricAlignment}</dd></div>}{item.professionalApplication && <div><dt>Professional application</dt><dd>{item.professionalApplication}</dd></div>}</dl>}
    <div className="summary-references" aria-label="Supporting sources"><BookOpenCheck size={13} />{item.sourceRefs.length ? item.sourceRefs.map((reference) => <span key={reference}>{labels.get(reference) ?? `Source reference unavailable (${reference})`}</span>) : <span>Insufficient evidence · no course source reference</span>}</div>
  </article>) : <p className="summary-empty">{empty}</p>}</section>;
}
