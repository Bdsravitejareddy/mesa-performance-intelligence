import type { CompetencyAssessment } from "@/lib/competency/classify";
import { formatOfficialMark } from "@/lib/scoring";

const MAPPING_LABELS = { user_tagged: "member-tagged", official_rubric: "official rubric", learning_objective: "learning objective", ai_suggested: "AI-suggested, reviewed" } as const;

export function CompetencyWhy({ assessment }: { assessment: CompetencyAssessment }) {
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
    </div>
  </details>;
}
