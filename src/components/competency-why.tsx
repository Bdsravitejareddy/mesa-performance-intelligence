import type { ReactNode } from "react";
import { STATE_LABELS, type CompetencyAssessment, type CompetencyState } from "@/lib/competency/classify";
import { formatOfficialMark } from "@/lib/scoring";

const MAPPING_LABELS = { user_tagged: "member-tagged", official_rubric: "official rubric", learning_objective: "learning objective", ai_suggested: "AI-mapped" } as const;

export type HistoryRow = { state: CompetencyState; confidence: string; headline: string; reason: "initial" | "evidence_changed" | "mapping_changed" | "rules_changed"; recorded_at: string };
const REASONS: Record<HistoryRow["reason"], string> = { initial: "First recorded", evidence_changed: "Evidence changed (new or regraded marks)", mapping_changed: "Mapping changed (tags added or removed)", rules_changed: "Classification rules changed" };

export type ClaimRow = { claim: string; status: string; source: string };

export function CompetencyWhy({ assessment, history = [], claims = [], children }: { assessment: CompetencyAssessment; history?: HistoryRow[]; claims?: ClaimRow[]; children?: ReactNode }) {
  const { why } = assessment;
  return <details className="competency-why">
    <summary>Why this conclusion?</summary>
    <div className="competency-why-body">
      <h3>Evidence</h3>
      {why.evidence.length ? <ul className="competency-evidence">{why.evidence.map((row, index) => <li key={`${row.assessmentId}-${row.submissionId ?? "none"}-${index}`}>
        <span><strong>{row.assessmentTitle}</strong> · {row.course}</span>
        <span className={`band band-${row.band}`}>{row.mark === null ? "No released mark" : row.granularity === "criterion" ? `${row.mark}% of criterion` : formatOfficialMark(row.mark)}</span>
        <small>{row.source}{row.date ? ` · ${new Date(row.date).toLocaleDateString()}` : ""} · {MAPPING_LABELS[row.mappingSource]} mapping · {row.granularity === "criterion" ? "criterion mark" : "whole-assessment mark"}</small>
        {row.feedback.trim() && <q>{row.feedback.trim().slice(0, 300)}</q>}
      </li>)}</ul> : <p>No assessment is mapped to this competency.</p>}
      <h3>Benchmark</h3><p>{why.benchmark}</p>
      <h3>Interpretation</h3><p>{why.interpretation}</p>
      {why.limitations.length > 0 && <><h3>Limitations</h3><ul>{why.limitations.map((item) => <li key={item}>{item}</li>)}</ul></>}
      <h3>What would change this</h3><p>{why.wouldChangeThis}</p>
      {claims.length > 0 && <><h3>Professional claims — not counted in this classification</h3><ul className="competency-claims">{claims.map((row, index) => <li key={`${row.claim}-${index}`}>{row.claim} <small>({row.source} · {row.status === "supported" ? "supported by other evidence" : "claim, not yet supported"})</small></li>)}</ul></>}
      {history.length > 0 && <><h3>History</h3><ol className="competency-history">{history.map((row, index) => <li key={`${row.recorded_at}-${index}`}><span>{new Date(row.recorded_at).toLocaleDateString()}</span><strong>{STATE_LABELS[row.state]}</strong><small>{row.confidence === "insufficient" ? "no confidence rating" : `${row.confidence} confidence`} · {REASONS[row.reason]}</small></li>)}</ol><p className="history-note">A change here can reflect new information or a different mapping rather than a change in skill.</p></>}
      {children}
    </div>
  </details>;
}
