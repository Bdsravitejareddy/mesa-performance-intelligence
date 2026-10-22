import type { CompetencyAssessment } from "@/lib/competency/classify";
import type { RoleReadiness } from "@/lib/roles/readiness";
import { chooseActivity, type CompetencyInput } from "@/lib/roadmap/prioritise";

export type SwotCategory = "strength" | "weakness" | "opportunity" | "threat";
export type SwotItem = {
  key: string;
  category: SwotCategory;
  title: string;
  description: string;
  evidence: string[];
  sources: string[];
  confidence: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  action: string;
  basis: "confirmed" | "possibility" | "context";
};

export type SwotCompetency = { id: string; name: string; domain: string; assessment: CompetencyAssessment; mappedAssessments: number };
export type CriterionGap = { assessment: string; course: string; label: string; score: number; max: number; overall: number };
export type SwotInputs = {
  competencies: SwotCompetency[];
  readiness: RoleReadiness[];
  supportedClaims: { claim: string; competency: string; source: string }[];
  criterionGaps: CriterionGap[];
  dataQuality: { syncWarning: string | null; heldAssignments: number; describedShare: number | null };
};

const confidenceOf = (value: string): SwotItem["confidence"] => (value === "high" ? "high" : value === "medium" ? "medium" : "low");
const evidenceLines = (assessment: CompetencyAssessment) => assessment.why.evidence.filter((row) => row.mark !== null).slice(0, 4).map((row) => `${row.assessmentTitle} (${row.course}): ${row.granularity === "criterion" ? `${row.mark}% of criterion` : `${row.mark}/100`}`);
const sourcesOf = (assessment: CompetencyAssessment) => [...new Set(assessment.why.evidence.map((row) => row.source))].slice(0, 3);

// Every item is derived from structured findings; nothing is generated free-form. Missing evidence never becomes a weakness.
export function buildEvidenceSwot(input: SwotInputs): SwotItem[] {
  const items: SwotItem[] = [];
  const primary = input.readiness.filter((item) => item.role.tier === "primary");
  const roleNeeds = (competencyId: string, tier: "primary" | "cross" = "primary") => input.readiness.filter((item) => item.role.tier === tier && item.role.competencies.includes(competencyId)).map((item) => item.role.name);
  const toInput = (item: SwotCompetency): CompetencyInput => ({ id: item.id, name: item.name, domain: item.domain, state: item.assessment.state, confidence: item.assessment.confidence, headline: item.assessment.headline, mappedAssessments: item.mappedAssessments, hasLowResult: item.assessment.why.evidence.some((row) => row.band === "low"), courses: [...new Set(item.assessment.why.evidence.map((row) => row.course))] });

  for (const item of input.competencies) {
    const { state, confidence } = item.assessment;
    const needed = roleNeeds(item.id);
    const impact: SwotItem["impact"] = needed.length ? "high" : item.mappedAssessments > 1 ? "medium" : "low";
    const action = chooseActivity(toInput(item), needed.length > 0).title;
    if (state === "demonstrated_strength") items.push({ key: `strength:${item.id}`, category: "strength", title: `${item.name} is a demonstrated strength`, description: `${item.assessment.headline}.${needed.length ? ` Required by ${needed.join(" and ")}.` : ""}`, evidence: evidenceLines(item.assessment), sources: sourcesOf(item.assessment), confidence: confidenceOf(confidence), impact, action: `Use it: ${action}`, basis: "confirmed" });
    if (state === "development_area") items.push({ key: `weakness:${item.id}`, category: "weakness", title: `${item.name} is a demonstrated development area`, description: `${item.assessment.headline}. ${item.assessment.why.interpretation}`, evidence: evidenceLines(item.assessment), sources: sourcesOf(item.assessment), confidence: confidenceOf(confidence), impact, action, basis: "confirmed" });
    if (state === "conflicting") items.push({ key: `weakness:conflict:${item.id}`, category: "weakness", title: `${item.name} results are inconsistent`, description: "High and low results disagree; this may be a context-specific weakness rather than a general one.", evidence: evidenceLines(item.assessment), sources: sourcesOf(item.assessment), confidence: "low", impact, action, basis: "possibility" });
    if (state === "emerging") items.push({ key: `opportunity:emerging:${item.id}`, category: "opportunity", title: `Turn emerging ${item.name.toLowerCase()} into a demonstrated strength`, description: `${item.assessment.headline}. One more strong result in a different context would establish it.`, evidence: evidenceLines(item.assessment), sources: sourcesOf(item.assessment), confidence: "low", impact, action, basis: "possibility" });
    if (state === "insufficient_evidence" && needed.length) {
      const lowSignal = item.assessment.why.evidence.some((row) => row.band === "low");
      items.push({ key: `opportunity:proof:${item.id}`, category: "opportunity", title: `Build proof of ${item.name.toLowerCase()} for ${needed.join(" and ")}`, description: lowSignal ? "One low result exists but does not establish a gap; a second data point would confirm or clear it." : "Your target roles need it and nothing in your record demonstrates it yet. This is missing evidence, not a weakness.", evidence: evidenceLines(item.assessment), sources: sourcesOf(item.assessment), confidence: "low", impact: "high", action, basis: "possibility" });
    }
    if (state === "development_area" && needed.length) items.push({ key: `threat:gap:${item.id}`, category: "threat", title: `${needed.join(" and ")} require ${item.name.toLowerCase()}, where results show a gap`, description: "A demonstrated gap in a requirement of your primary target roles is the most direct risk to readiness.", evidence: evidenceLines(item.assessment), sources: sourcesOf(item.assessment), confidence: confidenceOf(confidence), impact: "high", action, basis: "confirmed" });
  }

  for (const gap of input.criterionGaps) items.push({ key: `weakness:criterion:${gap.assessment}:${gap.label}`, category: "weakness", title: `${gap.label} scored low inside an acceptable overall mark`, description: `${gap.assessment} (${gap.course}) scored ${gap.overall}/100 overall, but ${gap.label} was ${gap.score}/${gap.max}. A single assessment, so treat it as a topic to check.`, evidence: [`${gap.label}: ${gap.score}/${gap.max} in official feedback`], sources: ["Official feedback"], confidence: "medium", impact: "medium", action: `Redo the ${gap.label.toLowerCase()} part of ${gap.assessment} and compare`, basis: "confirmed" });

  for (const claim of input.supportedClaims) items.push({ key: `strength:claim:${claim.claim}`, category: "strength", title: `Supported claim: ${claim.claim}`, description: `Claimed in professional evidence and supported by another item${claim.competency ? ` (${claim.competency})` : ""}.`, evidence: [claim.claim], sources: [claim.source], confidence: "medium", impact: "medium", action: "Reference the supporting evidence when you apply", basis: "possibility" });

  for (const role of input.readiness.filter((item) => item.role.tier === "cross")) {
    const share = role.skillRequirements ? Math.round((role.evidenced / role.skillRequirements) * 100) : 0;
    if (role.skillRequirements) items.push({ key: `opportunity:role:${role.role.key}`, category: "opportunity", title: `${role.role.name}: ${share}% of skill requirements evidenced`, description: `A Stage 2 role. ${role.evidenced} of ${role.skillRequirements} skill requirements are evidenced; most of its competencies overlap with your primary targets.`, evidence: role.role.postings.map((posting) => `${posting.title} — ${posting.employer}`), sources: role.role.postings.map((posting) => posting.url), confidence: "low", impact: "medium", action: "Prioritise competencies shared with your primary targets", basis: "context" });
  }
  for (const role of primary) {
    const experience = role.eligibility.map((item) => item.quote).filter((quote) => /\d+\+?\s*years/i.test(quote));
    if (experience.length) items.push({ key: `threat:eligibility:${role.role.key}`, category: "threat", title: `${role.role.name} postings set experience thresholds`, description: "These are eligibility requirements, not skills; they can limit which openings fit now regardless of skill evidence.", evidence: experience.slice(0, 3), sources: role.role.postings.map((posting) => posting.url), confidence: "high", impact: "high", action: "Target postings and levels whose thresholds match your experience, and build directly relevant project evidence", basis: "context" });
  }

  if (input.dataQuality.syncWarning) items.push({ key: "threat:data:sync", category: "threat", title: "Your LMS data may be incomplete", description: input.dataQuality.syncWarning, evidence: [], sources: ["LMS sync status"], confidence: "high", impact: "medium", action: "Check Marks & feedback; the nightly sync retries automatically", basis: "context" });
  if (input.dataQuality.heldAssignments) items.push({ key: "threat:data:held", category: "threat", title: `${input.dataQuality.heldAssignments} LMS assignment${input.dataQuality.heldAssignments === 1 ? " is" : "s are"} not linked to a course`, description: "Their results cannot inform any competency until they are filed.", evidence: [], sources: ["Evidence library"], confidence: "high", impact: "low", action: "File them in the Evidence library (or let Drive matching file them)", basis: "context" });
  return items;
}

export type SwotChange = { added: string[]; removed: { key: string; title: string }[] };

export function compareSwot(previous: { key: string; title: string }[] | null, current: SwotItem[]): SwotChange {
  if (!previous) return { added: [], removed: [] };
  const before = new Set(previous.map((item) => item.key));
  const now = new Set(current.map((item) => item.key));
  return { added: current.filter((item) => !before.has(item.key)).map((item) => item.key), removed: previous.filter((item) => !now.has(item.key)) };
}
