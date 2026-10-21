export type SwotMarkEvidence = {
  id: string;
  title: string;
  course: string;
  mark: number | null;
  feedback: string;
  source: string | null;
};

export type SwotSignal = {
  category: "strength" | "weakness" | "opportunity" | "threat";
  title: string;
  evidence: string;
  sourceReference: string;
  sourceIds: string[];
  confidence: "medium" | "low" | "insufficient";
  reviewStatus: "suggested";
};

const readableMark = (mark: number) => Number.isInteger(mark) ? String(mark) : mark.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
const sourceName = (row: SwotMarkEvidence) => [row.course, row.title].filter(Boolean).join(" · ");

export function buildSwotSignals(input: SwotMarkEvidence[]): SwotSignal[] {
  const rows = input.filter((row) => typeof row.id === "string" && row.id.length > 0);
  const marks = rows.filter((row) => row.mark !== null && Number.isFinite(row.mark) && row.mark >= 0 && row.mark <= 100);
  const signals: SwotSignal[] = [];
  const high = marks.filter((row) => row.mark! >= 85);
  const lower = marks.filter((row) => row.mark! < 65);
  const feedbackRows = rows.filter((row) => row.feedback.trim().length > 0);

  if (high.length) {
    const latest = high[0];
    signals.push({
      category: "strength",
      title: high.length > 1 ? `High results in ${high.length} assessments` : `High result in ${latest.course}`,
      evidence: high.map((row) => `${sourceName(row)}: ${readableMark(row.mark!)}/100`).join("; ") + ". A high score is evidence for this assessment, not proof of overall mastery.",
      sourceReference: high.map((row) => `${row.source?.trim() || "Official marks"} · ${sourceName(row)}`).join("; "),
      sourceIds: high.map((row) => row.id),
      confidence: high.length > 1 ? "medium" : "low",
      reviewStatus: "suggested",
    });
  }

  if (lower.length) {
    signals.push({
      category: "weakness",
      title: lower.length > 1 ? `Review ${lower.length} lower-scoring assessments` : `Review the result in ${lower[0].course}`,
      evidence: lower.map((row) => `${sourceName(row)}: ${readableMark(row.mark!)}/100`).join("; ") + ". These results identify work to inspect; marks alone do not establish a general competency weakness.",
      sourceReference: lower.map((row) => `${row.source?.trim() || "Official marks"} · ${sourceName(row)}`).join("; "),
      sourceIds: lower.map((row) => row.id),
      confidence: lower.length > 1 ? "medium" : "low",
      reviewStatus: "suggested",
    });
  }

  if (feedbackRows.length) {
    signals.push({
      category: "opportunity",
      title: "Turn evaluator feedback into a focused practice plan",
      evidence: feedbackRows.slice(0, 3).map((row) => `${sourceName(row)}: “${row.feedback.trim().slice(0, 420)}”`).join(" · "),
      sourceReference: feedbackRows.slice(0, 3).map((row) => `${row.source?.trim() || "Official feedback"} · ${sourceName(row)}`).join("; "),
      sourceIds: feedbackRows.slice(0, 3).map((row) => row.id),
      confidence: "medium",
      reviewStatus: "suggested",
    });
  } else {
    signals.push({
      category: "opportunity",
      title: "Add evaluator feedback or submission evidence",
      evidence: "No official feedback is available to identify a course-grounded improvement action yet. Link submitted work or sync feedback to make this section specific.",
      sourceReference: "Evidence gap · marks and feedback",
      sourceIds: [],
      confidence: "insufficient",
      reviewStatus: "suggested",
    });
  }

  signals.push({
    category: "threat",
    title: "External threats remain unassessed",
    evidence: `This view draws on ${marks.length} valid official mark${marks.length === 1 ? "" : "s"} and ${feedbackRows.length} feedback record${feedbackRows.length === 1 ? "" : "s"}. Academic results do not establish external career or business risks, and missing submissions may change the picture.`,
    sourceReference: marks.length ? `Coverage · ${marks.length} official mark${marks.length === 1 ? "" : "s"}; ${feedbackRows.length} feedback record${feedbackRows.length === 1 ? "" : "s"}` : "Evidence gap · no official marks available",
    sourceIds: marks.map((row) => row.id),
    confidence: marks.length ? "low" : "insufficient",
    reviewStatus: "suggested",
  });
  return signals;
}
