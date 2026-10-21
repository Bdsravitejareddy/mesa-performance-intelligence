// Deterministic, criteria-based competency classification. No AI and no cohort comparison.

export const HIGH_RESULT = 85;
export const LOW_RESULT = 65;
const STALE_AFTER_DAYS = 180;

export type CompetencyState =
  | "demonstrated_strength"
  | "emerging"
  | "meets_expectations"
  | "development_area"
  | "conflicting"
  | "insufficient_evidence";

export type Confidence = "high" | "medium" | "low" | "insufficient";

export type CompetencyEvidence = {
  submissionId: string | null;
  assessmentId: string;
  assessmentTitle: string;
  course: string;
  // Official 0–100 mark; null when no earned mark exists. Never treated as zero.
  mark: number | null;
  feedback: string;
  date: string | null;
  source: string;
  mappingSource: "user_tagged" | "official_rubric" | "learning_objective" | "ai_suggested";
  // A whole-assessment mark is indirect evidence for each competency the assessment covers.
  granularity: "whole_assessment" | "criterion";
};

export type EvidenceRow = CompetencyEvidence & { band: "high" | "middle" | "low" | "unscored" };

export type CompetencyAssessment = {
  state: CompetencyState;
  confidence: Confidence;
  headline: string;
  why: {
    evidence: EvidenceRow[];
    benchmark: string;
    interpretation: string;
    limitations: string[];
    wouldChangeThis: string;
  };
};

export const STATE_LABELS: Record<CompetencyState, string> = {
  demonstrated_strength: "Demonstrated strength",
  emerging: "Emerging capability",
  meets_expectations: "Meets expectations",
  development_area: "Demonstrated development area",
  conflicting: "Conflicting evidence",
  insufficient_evidence: "Insufficient evidence",
};

const BENCHMARK = `Criteria-based bands on the official 0–100 scale: ${HIGH_RESULT} or above is a high result, below ${LOW_RESULT} is a low result. No cohort ranking or percentile is used.`;

export function bandFor(mark: number | null): EvidenceRow["band"] {
  if (mark === null || !Number.isFinite(mark)) return "unscored";
  if (mark >= HIGH_RESULT) return "high";
  if (mark < LOW_RESULT) return "low";
  return "middle";
}

export function classifyCompetency(input: CompetencyEvidence[], now: Date = new Date()): CompetencyAssessment {
  // Suggested AI mappings are never evidence; only accepted mappings reach this function, but guard anyway.
  const evidence: EvidenceRow[] = input.map((item) => ({ ...item, band: bandFor(item.mark) }));
  const scored = latestPerAssessment(evidence.filter((item) => item.band !== "unscored"));
  const high = scored.filter((item) => item.band === "high");
  const low = scored.filter((item) => item.band === "low");
  const middle = scored.filter((item) => item.band === "middle");
  const limitations = buildLimitations(evidence, scored, now);
  const base = { evidence, benchmark: BENCHMARK, limitations };

  if (!evidence.length) {
    return {
      state: "insufficient_evidence",
      confidence: "insufficient",
      headline: "Not assessed yet",
      why: { ...base, interpretation: "No assessment has been mapped to this competency, so nothing about it has been demonstrated either way. This is not a weakness.", wouldChangeThis: "Tag an assessment that tests this competency, or complete work that does." },
    };
  }
  if (!scored.length) {
    return {
      state: "insufficient_evidence",
      confidence: "insufficient",
      headline: "Mapped, but no released mark",
      why: { ...base, interpretation: "Assessments are mapped to this competency, but none has an official earned mark yet. Missing marks are not treated as zero.", wouldChangeThis: "A released official mark on any mapped assessment." },
    };
  }

  const confidence = confidenceFor(scored);
  if (high.length && low.length) {
    return {
      state: "conflicting",
      confidence,
      headline: `${high.length} high and ${low.length} low result${low.length > 1 ? "s" : ""}`,
      why: { ...base, interpretation: "Results point in different directions across assessments. The difference may reflect context, difficulty, format, or what each assessment actually tested; it is reported rather than averaged away.", wouldChangeThis: "Criterion-level feedback or rubric scores showing which part of each assessment drove the result." },
    };
  }
  if (scored.length === 1) {
    const only = scored[0];
    if (only.band === "high") {
      return { state: "emerging", confidence, headline: "One high result", why: { ...base, interpretation: "One high result is early positive evidence. A single assessment cannot establish a strength.", wouldChangeThis: "A second high result on a different assessment would support a demonstrated strength." } };
    }
    if (only.band === "low") {
      return { state: "insufficient_evidence", confidence, headline: "One low result — check before concluding", why: { ...base, interpretation: "One low result is a signal to review that piece of work, not proof of a development area.", wouldChangeThis: "Another assessment of this competency: a second low result would establish a development area; a high one would make the evidence conflicting." } };
    }
    return { state: "insufficient_evidence", confidence, headline: "One mid-range result", why: { ...base, interpretation: "One result between the bands does not establish either a strength or a shortfall.", wouldChangeThis: "Further assessed work on this competency." } };
  }
  if (high.length >= 2) {
    return { state: "demonstrated_strength", confidence, headline: `High results in ${high.length} assessments`, why: { ...base, interpretation: `${high.length} separate assessments mapped to this competency scored ${HIGH_RESULT}/100 or above, with no low results.`, wouldChangeThis: "A low result on a later mapped assessment would make this conflicting." } };
  }
  if (low.length >= 2) {
    return { state: "development_area", confidence, headline: `Low results in ${low.length} assessments`, why: { ...base, interpretation: `${low.length} separate assessments mapped to this competency scored below ${LOW_RESULT}/100, with no high results. Because these are whole-assessment marks, the shortfall may sit in a specific part of the work; check the feedback.`, wouldChangeThis: "A high result on a later mapped assessment, or criterion feedback showing the low marks came from a different skill." } };
  }
  if (high.length === 1) {
    return { state: "emerging", confidence, headline: "One high result, others mid-range", why: { ...base, interpretation: `One assessment scored ${HIGH_RESULT}/100 or above and ${middle.length + low.length} did not reach that band.`, wouldChangeThis: "Another high result would support a demonstrated strength." } };
  }
  return { state: "meets_expectations", confidence, headline: `${scored.length} results, none at the high or low band`, why: { ...base, interpretation: `Results sit between ${LOW_RESULT} and ${HIGH_RESULT}/100${low.length ? ", with one low result" : ""}. Neither a strength nor a shortfall is established.`, wouldChangeThis: "Consistently high or low results on further mapped assessments." } };
}

// A resubmission or corrected grade for the same assessment must not count twice.
function latestPerAssessment(rows: EvidenceRow[]): EvidenceRow[] {
  const byAssessment = new Map<string, EvidenceRow>();
  for (const row of rows) {
    const current = byAssessment.get(row.assessmentId);
    if (!current || (row.date ?? "") > (current.date ?? "")) byAssessment.set(row.assessmentId, row);
  }
  return [...byAssessment.values()];
}

function confidenceFor(scored: EvidenceRow[]): Confidence {
  const courses = new Set(scored.map((item) => item.course)).size;
  const hasCriterion = scored.some((item) => item.granularity === "criterion");
  if (scored.length >= 3 && courses >= 2 && hasCriterion) return "high";
  if (scored.length >= 2) return "medium";
  return "low";
}

function buildLimitations(evidence: EvidenceRow[], scored: EvidenceRow[], now: Date): string[] {
  const limitations: string[] = [];
  if (scored.length && scored.every((item) => item.granularity === "whole_assessment")) limitations.push("Uses whole-assessment marks only, so each mark reflects everything the assessment tested, not this competency alone. Confidence cannot be high without criterion-level evidence.");
  if (evidence.some((item) => item.mappingSource === "user_tagged")) limitations.push("The link between an assessment and this competency was tagged by a workspace member, not taken from an official rubric.");
  if (scored.length && new Set(scored.map((item) => item.course)).size === 1) limitations.push("All scored evidence comes from one course, so it may not transfer to other contexts.");
  if (evidence.some((item) => item.feedback.trim())) limitations.push("Evaluator feedback is shown for context but is not scored automatically.");
  const unscored = evidence.filter((item) => item.band === "unscored").length;
  if (unscored) limitations.push(`${unscored} mapped assessment${unscored > 1 ? "s have" : " has"} no released mark and ${unscored > 1 ? "were" : "was"} not counted.`);
  const newest = scored.map((item) => item.date).filter((date): date is string => Boolean(date)).sort().at(-1);
  if (newest && (now.getTime() - new Date(newest).getTime()) / 86400000 > STALE_AFTER_DAYS) limitations.push(`The most recent scored evidence is over ${STALE_AFTER_DAYS} days old.`);
  if (scored.some((item) => !item.date)) limitations.push("Some marks have no submission date, so recency cannot be fully checked.");
  return limitations;
}
