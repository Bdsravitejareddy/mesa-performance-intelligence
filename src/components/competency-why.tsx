import type { ReactNode } from "react";
import { STATE_LABELS, type CompetencyAssessment, type CompetencyState, type EvidenceRow } from "@/lib/competency/classify";
import { bandCounts } from "@/lib/competency/standing";
import { formatOfficialMark } from "@/lib/scoring";
import { STAKES_LABEL } from "@/lib/assessments/stakes";

const MAPPING_LABELS = { user_tagged: "member-tagged", official_rubric: "official rubric", learning_objective: "learning objective", ai_suggested: "AI-mapped", practice_test: "practice test" } as const;

export type HistoryRow = { state: CompetencyState; confidence: string; headline: string; reason: "initial" | "evidence_changed" | "mapping_changed" | "rules_changed"; recorded_at: string };
const REASONS: Record<HistoryRow["reason"], string> = { initial: "First recorded", evidence_changed: "Evidence changed (new or regraded marks)", mapping_changed: "Mapping changed (tags added or removed)", rules_changed: "Classification rules changed" };

export type ClaimRow = { claim: string; status: string; source: string };

export function CompetencyWhy({ assessment, history = [], claims = [], children }: { assessment: CompetencyAssessment; history?: HistoryRow[]; claims?: ClaimRow[]; children?: ReactNode }) {
  const { why } = assessment;
  return <details className="competency-why">
    <summary>Why this conclusion?</summary>
    <div className="competency-why-body">
      {(() => {
        // The counted list is the one the headline is computed from; everything else is shown below it with the reason.
        const counted = new Set(why.counted);
        const graded = why.counted.some((row) => row.stakes !== "practice");
        const tally = bandCounts(why.counted);
        const reason = (row: EvidenceRow) => row.band === "unscored" ? "no released mark" : graded && row.stakes === "practice" ? "practice work; graded work on this skill exists" : "replaced by a newer or criterion-level mark for the same assessment";
        const aside = why.evidence.filter((row) => !counted.has(row));
        return <>
          {why.counted.length > 0 && <p className="why-summary"><b>Counted ({why.counted.length}):</b> {[tally.high && `${tally.high} high`, tally.middle && `${tally.middle} mid-range`, tally.low && `${tally.low} low`].filter(Boolean).join(" · ")}. These are the results behind the conclusion above.</p>}
          <h3>Evidence counted</h3>
          {why.counted.length ? <ul className="competency-evidence">{why.counted.map((row, index) => <EvidenceItem key={`${row.assessmentId}-${row.submissionId ?? "none"}-${index}`} row={row} />)}</ul> : <p>{why.evidence.length ? "Nothing mapped here has a mark yet — this is unknown, not weak." : "No assessment is mapped to this competency yet — this is unknown, not weak."}</p>}
          {aside.length > 0 && <><h3>Also shown, not counted ({aside.length})</h3><ul className="competency-evidence">{aside.map((row, index) => <EvidenceItem key={`${row.assessmentId}-${row.submissionId ?? "none"}-aside-${index}`} row={row} note={reason(row)} />)}</ul></>}
        </>;
      })()}
      <h3>Benchmark</h3><p>{why.benchmark}</p>
      <h3>Interpretation</h3><p>{why.interpretation}</p>
      {why.limitations.length > 0 && <><h3>Limitations</h3><ul>{why.limitations.map((item) => <li key={item}>{item}</li>)}</ul></>}
      <h3>What would change this</h3><p>{why.wouldChangeThis}</p>
      {claims.length > 0 && <><h3>Professional claims — not counted in this classification</h3><ul className="competency-claims">{claims.map((row, index) => <li key={`${row.claim}-${index}`}>{row.claim} <small>({row.source} · {row.status === "supported" ? "supported by other evidence" : "claim, not yet supported"})</small></li>)}</ul></>}
      {history.length > 0 && <><h3>History</h3><ol className="competency-history">{history.map((row, index) => <li key={`${row.recorded_at}-${index}`}><span>{new Date(row.recorded_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}</span><strong>{STATE_LABELS[row.state]}</strong><small>{row.confidence === "insufficient" ? "no confidence rating" : `${row.confidence} confidence`} · {REASONS[row.reason]}</small></li>)}</ol><p className="history-note">A change here can reflect new information or a different mapping rather than a change in skill.</p></>}
      {children}
    </div>
  </details>;
}

function EvidenceItem({ row, note }: { row: EvidenceRow; note?: string }) {
  return <li className={note ? "is-set-aside" : undefined}>
    <span><strong>{row.assessmentTitle}</strong> · {row.course}{row.stakes && <em className="stakes-tag">{STAKES_LABEL[row.stakes]}</em>}{note && <em className="stakes-tag">not counted: {note}</em>}</span>
    <span className={`band band-${row.band}`}>{row.mark === null ? "No released mark" : row.evidenceKind === "ai_grade" ? `AI ${row.mark} (blind, not official)` : row.granularity === "criterion" ? `${row.mark}% of criterion` : formatOfficialMark(row.mark)}</span>
    <small>{row.source}{row.date ? ` · ${new Date(row.date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}` : ""} · {MAPPING_LABELS[row.mappingSource]} mapping · {row.granularity === "criterion" ? "criterion mark" : "whole-assessment mark"}</small>
    {row.feedback.trim() && <q>{row.feedback.trim().slice(0, 300)}</q>}
    {row.evidenceKind === "ai_grade" && row.excerpt && <small className="why-excerpt"><b>Grader&apos;s reading:</b> {row.excerpt}</small>}
  </li>;
}
