import type { CompetencyState, Confidence } from "@/lib/competency/classify";

// Transparent, deterministic prioritisation. Every factor is shown to the user next to the recommendation.
export const GAP_WEIGHT: Record<CompetencyState, number> = {
  development_area: 3,
  conflicting: 2.5,
  insufficient_evidence: 1.5,
  emerging: 1,
  meets_expectations: 0.8,
  demonstrated_strength: 0.2,
};
export const CONFIDENCE_FACTOR: Record<Confidence, number> = { high: 1, medium: 0.9, low: 0.75, insufficient: 0.7 };

export type CompetencyInput = { id: string; name: string; domain: string; state: CompetencyState; confidence: Confidence; headline: string; mappedAssessments: number; hasLowResult: boolean; courses: string[] };
export type Importance = { weight: number; reasons: string[] };
export type Activity = { title: string; why: string; effortHours: number; kind: "validate" | "close_gap" | "build_proof" | "broaden" | "resolve_conflict" };
export type Recommendation = { competencyId: string; competency: string; state: CompetencyState; confidence: Confidence; importance: Importance; gap: number; confidenceFactor: number; priority: number; activity: Activity };

// Concrete proof-building activities for competencies the platform has no evidence for.
const PROOF: Record<string, Omit<Activity, "kind">> = {
  "technical.sql": { title: "Complete an applied SQL project on a real dataset and publish the queries", why: "Produces checkable evidence of SQL ability.", effortHours: 10 },
  "technical.python": { title: "Build a small Python analysis notebook that answers one business question", why: "Shows applied programming, not just a claim.", effortHours: 10 },
  "technical.analytics": { title: "Build a metrics dashboard with a written interpretation of what it shows", why: "Evidence of analytics and communicating results.", effortHours: 8 },
  "analytical.numerical_analysis": { title: "Redo a market-sizing problem with every assumption stated and checked", why: "Validates numerical reasoning under the same conditions as coursework.", effortHours: 3 },
  "analytical.structured_problem_solving": { title: "Solve a timed case and get criterion-level feedback on the structure", why: "Tests structuring under time pressure.", effortHours: 3 },
  "product.discovery": { title: "Write a product requirements document from five customer conversations", why: "Creates evidence of discovery and product thinking.", effortHours: 8 },
  "product.customer_needs": { title: "Run and synthesise five user interviews into needs and jobs-to-be-done", why: "Direct evidence of customer understanding.", effortHours: 6 },
  "product.prioritisation": { title: "Prioritise a real backlog with an explicit framework and defend the cut line", why: "Shows prioritisation reasoning.", effortHours: 4 },
  "product.metrics": { title: "Define a metric tree and success criteria for one product decision", why: "Evidence of metric design.", effortHours: 3 },
  "decision.judgement": { title: "Complete a timed decision case and write the recommendation in one page", why: "Tests judgement under constraints.", effortHours: 3 },
  "decision.trade_offs": { title: "Write a decision memo comparing three options with explicit trade-offs", why: "Makes trade-off reasoning inspectable.", effortHours: 3 },
  "communication.clarity": { title: "Rewrite a past submission's executive summary and run it through the Quality Checker", why: "Measures clarity against a transparent standard.", effortHours: 2 },
  "communication.persuasion": { title: "Deliver a five-minute pitch and collect structured feedback", why: "Evidence of persuasion with a real audience.", effortHours: 4 },
  "business.finance": { title: "Build a unit-economics model for a company from a case and sanity-check it", why: "Evidence of financial reasoning.", effortHours: 5 },
  "business.strategy": { title: "Write a one-page strategy for a case company and test it against counter-arguments", why: "Evidence of strategic reasoning.", effortHours: 4 },
};

export function chooseActivity(input: CompetencyInput, roleRequired: boolean): Activity {
  const course = input.courses[0] ? ` from ${input.courses[0]}` : "";
  switch (input.state) {
    case "development_area":
      return { kind: "close_gap", title: `Redo a ${input.name.toLowerCase()} problem${course} under similar conditions, then ask for criterion-level feedback`, why: "Two or more low results establish the gap; a redo shows whether targeted practice closes it.", effortHours: 4 };
    case "conflicting":
      return { kind: "resolve_conflict", title: `Do a short, targeted exercise on ${input.name.toLowerCase()} to see which result reflects your ability`, why: "Results disagree; one focused piece of evidence resolves the conflict instead of averaging it away.", effortHours: 2 };
    case "insufficient_evidence":
      if (input.hasLowResult) return { kind: "validate", title: `Validate the suspected ${input.name.toLowerCase()} weakness with a timed exercise`, why: "One low result is a signal, not a conclusion; a second data point confirms or clears it.", effortHours: 2 };
      return { kind: "build_proof", ...(PROOF[input.id] ?? { title: `Produce one piece of assessed work that demonstrates ${input.name.toLowerCase()}`, why: roleRequired ? "Your target role needs it and nothing shows it yet." : "Nothing demonstrates it yet.", effortHours: 6 }) };
    case "emerging":
      return { kind: "broaden", title: `Show ${input.name.toLowerCase()} again in a different course or context`, why: "One high result is early evidence; a second, different context would establish a strength.", effortHours: 3 };
    default:
      return { kind: "broaden", title: `Apply ${input.name.toLowerCase()} in a project outside coursework`, why: "Extends existing evidence into a professional context.", effortHours: 6 };
  }
}

export function recommend(competencies: CompetencyInput[], importance: Map<string, Importance>, activeCompetencies: Set<string>, limit = 8): Recommendation[] {
  return competencies
    .filter((item) => !activeCompetencies.has(item.id))
    .map((item) => {
      const weight = importance.get(item.id) ?? { weight: item.mappedAssessments ? 1 : 0.5, reasons: item.mappedAssessments ? ["Assessed in your courses"] : ["Not linked to a course or target role"] };
      const roleRequired = weight.reasons.some((reason) => reason.startsWith("Required"));
      // Unassessed competencies only rank when a target role or course makes them matter.
      const gap = item.state === "insufficient_evidence" && !item.hasLowResult && weight.weight < 1 ? 0.3 : GAP_WEIGHT[item.state];
      const confidenceFactor = CONFIDENCE_FACTOR[item.confidence];
      const activity = chooseActivity(item, roleRequired);
      return { competencyId: item.id, competency: item.name, state: item.state, confidence: item.confidence, importance: weight, gap, confidenceFactor, priority: Math.round(weight.weight * gap * confidenceFactor * 100) / 100, activity };
    })
    .filter((item) => item.priority >= 0.5)
    .sort((a, b) => b.priority - a.priority || a.activity.effortHours - b.activity.effortHours)
    .slice(0, limit);
}

// Role requirements and course coverage decide how much a competency matters. Matching is by competency name.
export function importanceFrom(competencies: { id: string; name: string; mappedAssessments: number }[], requirements: { text: string; required: boolean; role: string }[]): Map<string, Importance> {
  const result = new Map<string, Importance>();
  for (const competency of competencies) {
    const words = competency.name.toLowerCase().split(/\s+/).filter((word) => word.length >= 3 && !["and", "the"].includes(word));
    const hits = requirements.filter((requirement) => words.length && words.every((word) => requirement.text.toLowerCase().includes(word)));
    const required = hits.find((hit) => hit.required);
    const reasons = [required ? `Required by ${required.role}` : hits[0] ? `Preferred by ${hits[0].role}` : "", competency.mappedAssessments ? "Assessed in your courses" : ""].filter(Boolean);
    const weight = (required ? 3 : hits.length ? 2 : 0) + (competency.mappedAssessments ? 1 : 0);
    if (weight) result.set(competency.id, { weight, reasons });
  }
  return result;
}

export type Outcome = "improved" | "unchanged" | "worse" | "no_new_evidence";
const RANK: Record<CompetencyState, number> = { development_area: 0, insufficient_evidence: 1, conflicting: 1, emerging: 2, meets_expectations: 2, demonstrated_strength: 3 };

// Judges an action only from evidence recorded after it started. No new evidence means no claim of improvement.
export function evaluateOutcome(start: { state: CompetencyState; evidenceFingerprint: string }, now: { state: CompetencyState; evidenceFingerprint: string }): Outcome {
  if (start.evidenceFingerprint === now.evidenceFingerprint) return "no_new_evidence";
  const delta = RANK[now.state] - RANK[start.state];
  return delta > 0 ? "improved" : delta < 0 ? "worse" : "unchanged";
}
