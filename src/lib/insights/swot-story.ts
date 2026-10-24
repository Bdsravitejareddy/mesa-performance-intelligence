import type { CompetencyAssessment, EvidenceRow } from "@/lib/competency/classify";
import type { RoleReadiness } from "@/lib/roles/readiness";

// The SWOT as a small set of ranked findings, each one a short story: a takeaway, what the evidence suggests and
// why it matters, and (where useful) one concrete next step. Every finding is built from structured evidence and
// keeps its sources; the written wording can be replaced by an AI rewrite (swot-narrative.ts), but the facts,
// ranking and evidence never come from the model. Missing evidence is never a weakness, a CV claim is never
// independent corroboration, and a qualification is context rather than proof of proficiency.

export type SwotCategory = "strength" | "weakness" | "opportunity" | "threat";
export type EvidenceClass = "official" | "ai_estimate" | "self_reported" | "independent_work" | "role_requirement" | "data";
export type FindingEvidence = { class: EvidenceClass; label: string; detail: string; date?: string | null; source?: string };
export type FindingKind =
  | "strength" | "promising" | "mostly_strong"
  | "development" | "conflict" | "criterion_gap"
  | "ai_signal" | "unassessed_role_skills" | "self_reported"
  | "eligibility" | "coverage" | "data_gap";
export type Finding = {
  key: string;
  category: SwotCategory;
  kind: FindingKind;
  subject: string;
  priority: number;
  relevance: string | null;
  keyFact: string;
  headline: string;
  body: string;
  action: string | null;
  evidence: FindingEvidence[];
  // Every figure the wording may use; an AI rewrite that states any other number is rejected.
  numbers: number[];
};

export type StoryCompetency = { id: string; name: string; domain: string; assessment: CompetencyAssessment; mappedAssessments: number };
export type StoryClaim = { claim: string; competencyId: string | null; claimType: string; fromKind: string; supportedByKind: string | null; status: string };
export type StoryInputs = {
  competencies: StoryCompetency[];
  readiness: RoleReadiness[];
  claims: StoryClaim[];
  criterionGaps: { assessment: string; course: string; label: string; score: number; max: number; overall: number }[];
  coverage: { assessments: number; officialMarks: number };
  dataQuality: { syncWarning: string | null; heldAssignments: number };
};

// Work artefacts someone else can inspect. A resume, a certificate or the member's own confirmation is not.
const INDEPENDENT_KINDS = new Set(["project", "portfolio", "repository", "dashboard", "presentation"]);

// One concrete exercise per competency, and what finishing it would establish.
const EXERCISES: Record<string, [string, string]> = {
  "analytical.logical_reasoning": ["take one timed reasoning set on the Tests page and write a line on each question you missed", "whether the result holds under time pressure"],
  "analytical.numerical_analysis": ["redo one market-sizing problem with every assumption written down and checked", "which of your two results is the better guide"],
  "analytical.structured_problem_solving": ["solve one timed case and ask for criterion-level feedback on its structure", "how you structure a problem when time is short"],
  "business.business_models": ["map one company's business model on a page, then name the assumption that would break it", "whether you can reason about a model, not just describe it"],
  "business.economics": ["write a 200-word explanation of one pricing decision using supply, demand and incentives", "whether the AI's reading matches how you reason"],
  "business.finance": ["build a unit-economics model for one case company and sanity-check it against its reported numbers", "that the skill carries beyond one course"],
  "business.strategy": ["write a one-page strategy for a case company and test it against two counter-arguments", "which kind of strategy task gives you trouble"],
  "communication.clarity": ["rewrite one past executive summary in half the words and run it through the Quality Checker", "whether clarity holds when it is marked"],
  "communication.persuasion": ["record a five-minute pitch on a real recommendation and collect two pieces of structured feedback", "how your case-making lands with a live audience"],
  "communication.stakeholder_management": ["write a one-page plan for a disagreement between two stakeholders in a past project", "how you handle competing interests"],
  "communication.storytelling": ["turn one analysis into a three-slide story with a single clear message", "whether your findings come across as a narrative"],
  "creativity.hypothesis_generation": ["list five hypotheses for one business problem and the data that would test each", "how you generate and test explanations"],
  "creativity.innovation": ["propose one new offering for a case company and the cheapest test of it", "how you develop a new idea into something testable"],
  "creativity.unconventional_solutions": ["give three unusual answers to one case question and argue for the best", "how far you look past the obvious answer"],
  "decision.judgement": ["complete one timed decision case and write the recommendation on a single page", "how you decide with incomplete information"],
  "decision.risk_assessment": ["write a risk register for one past project with likelihood, impact and a mitigation for each", "how you weigh what could go wrong"],
  "decision.trade_offs": ["write a decision memo comparing three options with the trade-offs spelled out", "which result reflects how you weigh options"],
  "execution.implementation": ["write up one thing you built end to end: the plan, what changed and what you would do differently", "that you can carry work through to delivery"],
  "execution.operations": ["map one process you know as-is and to-be, with the one metric you would improve", "whether the AI's mixed reading matches how you design processes"],
  "execution.prioritisation": ["prioritise a real to-do list with an explicit method and defend what you cut", "how you sequence work under limits"],
  "leadership.collaboration": ["write a short reflection on one group assignment: your part, a disagreement and how it was settled", "how you work within a team"],
  "leadership.conflict_resolution": ["describe one conflict you helped resolve: the positions, what you did and the outcome", "how you handle disagreement"],
  "leadership.ownership": ["write up one piece of work you took responsibility for beyond your brief, with its result", "that you take ownership without being asked"],
  "learning.adaptation": ["describe one time a plan failed and how you changed course", "how you respond when things change"],
  "learning.feedback_integration": ["pick one piece of faculty feedback, redo that section and compare the two versions", "that you act on feedback"],
  "learning.knowledge_transfer": ["apply one method from a course to a problem from another course and explain the fit", "that a method transfers between subjects"],
  "product.customer_needs": ["synthesise three customer conversations into needs and jobs-to-be-done", "which result reflects how you read customers"],
  "product.discovery": ["write a short requirements note from five customer conversations", "how you find the problem worth solving"],
  "product.metrics": ["define a metric tree and success criteria for one product decision", "how you choose what to measure"],
  "product.prioritisation": ["prioritise a real backlog with an explicit framework and defend the cut line", "how you make product trade-offs"],
  "technical.ai": ["document one AI feature you built: the prompt design, how you checked outputs and where it fails", "how you apply AI with judgement"],
  "technical.analytics": ["build a small metrics dashboard and write a paragraph on what it shows", "that you can do the analysis, not just hold the qualification"],
  "technical.python": ["build a short Python notebook that answers one business question and publish it", "that you can program for analysis in a way someone else can check"],
  "technical.sql": ["publish the queries for a small SQL analysis of a public dataset", "that you can use SQL in a way someone else can check"],
  "technical.systems_understanding": ["draw how one system you used works end to end and where it would fail at scale", "how you reason about systems"],
};
const exercise = (id: string, name: string): [string, string] => EXERCISES[id] ?? [`complete one short, marked exercise on ${name.toLowerCase()}`, "where you stand on it"];

const round = (value: number) => Math.round(value * 10) / 10;
const scored = (rows: EvidenceRow[]) => rows.filter((row) => row.mark !== null && row.mappingSource !== "practice_test");
const official = (rows: EvidenceRow[]) => scored(rows).filter((row) => row.evidenceKind !== "ai_grade");
const aiRows = (rows: EvidenceRow[]) => scored(rows).filter((row) => row.evidenceKind === "ai_grade");
const courseName = (course: string) => course.replace(/\s+with\s+.*$/i, "").replace(/^the\s+/i, "").trim();
const GENERIC = /^(mid[- ]?term|end[- ]?term|final|term)?\s*(assignment|assessment|exam|quiz|test|project|submission)\s*\d*$/i;
// Criterion rows carry their criterion after " · "; it is named separately, so the title drops it.
const short = (title: string) => title.replace(/\s+·\s+.*$/, "").replace(/\s+-\s+.*$/, "").replace(/\s*\(.*?\)\s*/g, " ").trim();
// A recognisable name for an assessment: a generic title ("Mid-Term Assignment") gets its course in front.
const named = (row: EvidenceRow) => { const title = short(row.assessmentTitle); return GENERIC.test(title) ? `your ${courseName(row.course)} ${title.toLowerCase()}` : title; };
// A result as a phrase: a criterion score is never presented as a whole mark.
const result = (row: EvidenceRow) => row.granularity === "criterion" ? `${row.mark}% on ${row.criterionLabel ?? "one criterion"} in ${named(row)}` : `${row.mark} in ${named(row)}`;
const list = (items: string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

function evidenceOf(rows: EvidenceRow[]): FindingEvidence[] {
  return rows.filter((row) => row.mark !== null || row.mappingSource === "practice_test").slice(0, 8).map((row) => ({
    class: row.evidenceKind === "ai_grade" ? "ai_estimate" as const : "official" as const,
    label: `${row.assessmentTitle} — ${row.course}`,
    detail: row.mark === null ? "No mark" : `${row.evidenceKind === "ai_grade" ? "AI estimate" : row.mappingSource === "practice_test" ? "Practice test (not counted)" : "Official mark"} ${row.granularity === "criterion" ? `${row.mark}% on ${row.criterionLabel ?? "a criterion"}` : `${row.mark}/100`}${row.stakes === "exam" ? " · term exam" : ""}${row.excerpt ? ` — grader's reading: “${row.excerpt.slice(0, 220)}”` : ""}`,
    date: row.date, source: row.source,
  }));
}

export function buildSwotStory(input: StoryInputs): Finding[] {
  const findings: Finding[] = [];
  const primaryRoles = (id: string) => input.readiness.filter((item) => item.role.tier === "primary" && item.role.competencies.includes(id)).map((item) => item.role.name);
  const crossRoles = (id: string) => input.readiness.filter((item) => item.role.tier === "cross" && item.role.competencies.includes(id)).map((item) => item.role.name);
  const claimsFor = (id: string) => input.claims.filter((claim) => claim.competencyId === id && claim.status !== "withdrawn");
  const claimEvidence = (claims: StoryClaim[]): FindingEvidence[] => claims.slice(0, 6).map((claim) => ({
    class: claim.supportedByKind && INDEPENDENT_KINDS.has(claim.supportedByKind) ? "independent_work" : "self_reported",
    label: claim.claim,
    detail: claim.claimType === "credential" ? "Qualification listed on your CV — context, not proof of proficiency" : claim.supportedByKind && INDEPENDENT_KINDS.has(claim.supportedByKind) ? `Backed by a ${claim.supportedByKind} you added` : claim.status === "attested" ? "From your CV, confirmed by you" : "From your CV",
  }));
  const relevanceOf = (id: string) => { const roles = primaryRoles(id); return roles.length ? `Your target ${roles.length === 1 ? "role" : "roles"} (${list(roles)}) ${roles.length === 1 ? "asks" : "ask"} for it.` : null; };
  const weight = (id: string) => primaryRoles(id).length ? 3 : crossRoles(id).length ? 1 : 0;
  const used = new Set<string>();
  const conflictAnchors = new Map<string, { low: EvidenceRow; highs: EvidenceRow[] }>();

  for (const item of input.competencies) {
    const { state, confidence } = item.assessment;
    const rows = item.assessment.why.evidence;
    const off = official(rows), ai = aiRows(rows);
    const highs = off.filter((row) => row.band === "high"), lows = off.filter((row) => row.band === "low");
    const aiHighs = ai.filter((row) => row.band === "high"), aiLows = ai.filter((row) => row.band === "low");
    const relevance = relevanceOf(item.id);
    const [task, establishes] = exercise(item.id, item.name);
    const claims = claimsFor(item.id).filter((claim) => claim.claimType !== "credential");
    const base = { subject: item.name, relevance, evidence: [...evidenceOf(rows), ...claimEvidence(claimsFor(item.id))] };
    const confidenceBoost = confidence === "high" ? 2 : confidence === "medium" ? 1 : 0;
    const best = [...off].sort((a, b) => b.mark! - a.mark!)[0];
    const worst = [...off].sort((a, b) => a.mark! - b.mark!)[0];
    const cvNote = claims.length ? ` Your CV also describes this, though that is your own account rather than separate proof.` : "";

    if (state === "demonstrated_strength" && best) {
      findings.push({ ...base, key: `strength:${item.id}`, category: "strength", kind: "strength", priority: 20 + weight(item.id) * 3 + highs.length + confidenceBoost,
        keyFact: `${highs.length} high official results, best ${result(best)}`,
        headline: `${item.name} is one of your clearest strengths.`,
        body: `${highs.length} of your official results for it are high, the best being ${result(best)}.${relevance ? ` ${relevance}` : ""}`,
        action: null, numbers: [highs.length, ...off.map((row) => row.mark!)] });
    } else if (state === "conflicting" && off.length && highs.length >= 2 && highs.length >= lows.length * 3 && worst) {
      findings.push({ ...base, key: `strength:mostly:${item.id}`, category: "strength", kind: "mostly_strong", priority: 18 + weight(item.id) * 3 + highs.length + confidenceBoost,
        keyFact: `${highs.length} high official results and one low, ${result(worst)}`,
        headline: `${item.name} is mostly strong, with one result that doesn't fit.`,
        body: `${highs.length} official results are high, including ${result(best)}. The exception is ${result(worst)}, so that one mark may say more about the task than about the skill.`,
        action: `Next: go back to ${named(worst)}, find the part that cost you marks, and redo just that part.`, numbers: [highs.length, ...off.map((row) => row.mark!)] });
    } else if (state === "emerging" && highs[0]) {
      const top = highs[0];
      findings.push({ ...base, key: `strength:promising:${item.id}`, category: "strength", kind: "promising", priority: 14 + weight(item.id) * 3 + confidenceBoost,
        keyFact: `an official ${result(top)}`,
        headline: `${item.name} looks like a promising strength.`,
        body: `Your official ${top.granularity === "criterion" ? `score of ${result(top)}` : `mark of ${result(top)}`} is a strong result ${GENERIC.test(short(top.assessmentTitle)) ? "for that course" : `in ${courseName(top.course)}`}. It is one result, so it tells you about that course rather than settling the question.${cvNote}`,
        action: `Next: ${task}. It would show ${establishes}.`, numbers: [top.mark!, ...off.map((row) => row.mark!)] });
    } else if (state === "development_area" && worst) {
      findings.push({ ...base, key: `weakness:${item.id}`, category: "weakness", kind: "development", priority: 24 + weight(item.id) * 4 + lows.length + confidenceBoost,
        keyFact: `${lows.length} low official results, lowest ${result(worst)}`,
        headline: `${item.name} is holding your marks back.`,
        body: `${lows.length} official results for it are low, the lowest ${result(worst)}.${relevance ? ` ${relevance} That makes it worth fixing before it shows up again.` : " More than one result points the same way, so it is a pattern rather than a bad day."}`,
        action: `Next: ${task}, then compare it with what you wrote for ${named(worst)}. It would show whether focused practice closes the gap.`, numbers: [lows.length, ...off.map((row) => row.mark!)] });
    } else if (state === "conflicting") {
      const aiOnly = !off.length;
      const hi = aiOnly ? aiHighs : highs, lo = aiOnly ? aiLows : lows;
      if (!hi.length || !lo.length) continue;
      if (!aiOnly) conflictAnchors.set(`weakness:conflict:${item.id}`, { low: lo[0], highs: hi });
      findings.push({ ...base, key: `weakness:conflict:${item.id}`, category: "weakness", kind: "conflict", priority: (aiOnly ? 8 : 16) + weight(item.id) * 3 + confidenceBoost,
        keyFact: aiOnly ? `AI estimates: ${hi.length} high, ${lo.length} low` : `${result(hi[0])} against ${result(lo[0])}`,
        headline: aiOnly ? `The AI's read on your ${item.name.toLowerCase()} is split.` : `Your ${item.name.toLowerCase()} results point in different directions.`,
        body: aiOnly
          ? `AI estimates of your work rate ${hi.length} pieces high and ${lo.length} low, and there is no official mark yet to settle it. Treat it as an open question, not a weakness.`
          : `You scored ${result(hi[0])} but ${result(lo[0])}. An average would hide that gap, and the two tasks may be testing different things.`,
        action: `Next: ${task}. It would show ${establishes}.`, numbers: [hi.length, lo.length, ...scored(rows).map((row) => row.mark!)] });
    } else if (state === "emerging" && aiHighs[0] && !off.length) {
      const top = aiHighs[0];
      findings.push({ ...base, key: `opportunity:ai:${item.id}`, category: "opportunity", kind: "ai_signal", priority: 6 + weight(item.id) * 3,
        keyFact: `an AI estimate of ${result(top)}`,
        headline: `There's an early, unofficial signal in ${item.name.toLowerCase()}.`,
        body: `An AI estimate rated ${named(top).replace(/^your /, "your ")} work ${top.mark}, but no official mark covers ${item.name.toLowerCase()} yet. It is worth testing, not yet worth claiming.`,
        action: `Next: ${task}. It would show ${establishes}.`, numbers: [top.mark!, ...ai.map((row) => row.mark!)] });
    } else continue;
    used.add(item.id);
  }

  // One low assessment behind several conflicts is one finding about that piece of work, not one per skill.
  const byLow = new Map<string, Finding[]>();
  for (const finding of findings) { const anchor = conflictAnchors.get(finding.key); if (anchor) byLow.set(anchor.low.assessmentId, [...(byLow.get(anchor.low.assessmentId) ?? []), finding]); }
  for (const group of byLow.values()) {
    if (group.length < 2) continue;
    const low = conflictAnchors.get(group[0].key)!.low;
    const highs = [...new Map(group.flatMap((finding) => conflictAnchors.get(finding.key)!.highs).map((row) => [row.assessmentId, row])).values()].sort((a, b) => b.mark! - a.mark!);
    const skills = group.map((finding) => finding.subject);
    const merged: Finding = { key: `weakness:outlier:${low.assessmentId}`, category: "weakness", kind: "conflict", subject: courseName(low.course), priority: Math.max(...group.map((finding) => finding.priority)) + 2,
      relevance: group.map((finding) => finding.relevance).find(Boolean) ?? null,
      keyFact: `${result(low)} against ${result(highs[0])} for the same skills`,
      headline: `One assessment sits well below the rest: ${named(low).replace(/^your /, "your ")}.`,
      body: `You scored ${result(low)}, while ${list(skills.map((name) => name.toLowerCase()))} scored as high as ${highs[0].mark} elsewhere. One low piece of work touching ${skills.length} skills more likely points to that assessment than to all of them at once.`,
      action: `Next: reread the feedback on ${named(low)} and redo the one section that cost you the most marks.`,
      evidence: [...new Map(group.flatMap((finding) => finding.evidence).map((row) => [`${row.label}|${row.detail}`, row])).values()],
      numbers: [skills.length, ...group.flatMap((finding) => finding.numbers)] };
    const keys = new Set(group.map((finding) => finding.key));
    findings.splice(0, findings.length, ...findings.filter((finding) => !keys.has(finding.key)), merged);
  }

  for (const gap of input.criterionGaps) {
    findings.push({ key: `weakness:criterion:${gap.assessment}:${gap.label}`, category: "weakness", kind: "criterion_gap", subject: gap.label, priority: 15, relevance: null,
      keyFact: `${gap.label}: ${gap.score}/${gap.max} inside an overall ${gap.overall}`,
      headline: `${gap.label} cost you marks in ${short(gap.assessment)}.`,
      body: `Your overall mark was ${gap.overall}, but the faculty gave ${gap.label.toLowerCase()} ${gap.score} out of ${gap.max}. It is one assessment, so treat it as a topic to check rather than a settled weakness.`,
      action: `Next: redo the ${gap.label.toLowerCase()} section of ${short(gap.assessment)} and compare it with the original.`,
      evidence: [{ class: "official", label: `${gap.assessment} — ${gap.course}`, detail: `Official feedback: ${gap.label} ${gap.score}/${gap.max}; overall ${gap.overall}/100` }], numbers: [gap.score, gap.max, gap.overall] });
  }

  // Skills the primary roles need that nothing assessed shows yet: one consolidated finding, never a weakness.
  const unassessed = input.competencies.filter((item) => item.assessment.state === "insufficient_evidence" && primaryRoles(item.id).length && !used.has(item.id))
    .sort((a, b) => primaryRoles(b.id).length - primaryRoles(a.id).length || claimsFor(b.id).length - claimsFor(a.id).length);
  if (unassessed.length) {
    const top = unassessed[0];
    const [task, establishes] = exercise(top.id, top.name);
    const names = unassessed.slice(0, 3).map((item) => item.name);
    findings.push({ key: "opportunity:unassessed", category: "opportunity", kind: "unassessed_role_skills", subject: top.name, priority: 22, relevance: `Your target roles list ${list(names)}${unassessed.length > 3 ? " and others" : ""} as requirements.`,
      keyFact: `${unassessed.length} required skills with no assessed evidence, starting with ${list(names)}`,
      headline: `Several skills your target roles need haven't been tested yet.`,
      body: `Nothing marked so far covers ${list(names)}${unassessed.length > 3 ? `, or ${unassessed.length - 3} other skills the roles ask for` : ""}. That is a gap in the record, not a weakness — but employers will look for it.`,
      action: `Next: start with ${top.name}: ${task}. It would show ${establishes}.`,
      evidence: unassessed.map((item) => ({ class: "role_requirement" as const, label: item.name, detail: `Required by ${list(primaryRoles(item.id))}; ${item.assessment.why.evidence.some((row) => row.band === "low") ? "one low result so far, not enough to conclude anything" : "no marked evidence yet"}` })),
      numbers: [unassessed.length, unassessed.length - 3] });
    unassessed.forEach((item) => used.add(item.id));
  }

  // CV experience with nothing assessed behind it: an opportunity to turn your own account into checkable work.
  const cvGroups = new Map<string, StoryClaim[]>();
  for (const claim of input.claims) if (claim.competencyId && claim.claimType !== "credential" && !used.has(claim.competencyId) && !(claim.supportedByKind && INDEPENDENT_KINDS.has(claim.supportedByKind))) cvGroups.set(claim.competencyId, [...(cvGroups.get(claim.competencyId) ?? []), claim]);
  const names = new Map(input.competencies.map((item) => [item.id, item.name]));
  for (const [id, claims] of [...cvGroups].sort((a, b) => weight(b[0]) - weight(a[0]) || b[1].length - a[1].length).slice(0, 2)) {
    const name = names.get(id) ?? id;
    const [task, establishes] = exercise(id, name);
    findings.push({ key: `opportunity:cv:${id}`, category: "opportunity", kind: "self_reported", subject: name, priority: 10 + weight(id) * 2 + Math.min(claims.length, 3), relevance: relevanceOf(id),
      keyFact: `${claims.length} CV ${claims.length === 1 ? "entry" : "entries"} on ${name.toLowerCase()}, none independently checked`,
      headline: `Your CV tells a ${name.toLowerCase()} story that nothing here can check yet.`,
      body: `You describe ${claims.length === 1 ? "an achievement" : `${claims.length} achievements`} in ${name.toLowerCase()} on your CV. That is your own account; until a piece of work shows it, it cannot count as evidence.`,
      action: `Next: ${task}. It would show ${establishes}.`, evidence: claimEvidence(claims), numbers: [claims.length] });
    used.add(id);
  }

  // How much of the record has an official mark: conclusions from a thin record should be held loosely.
  const { assessments, officialMarks } = input.coverage;
  if (assessments >= 5 && officialMarks / assessments < 0.5) findings.push({ key: "threat:coverage", category: "threat", kind: "coverage", subject: "Released marks", priority: 19, relevance: null,
    keyFact: `${officialMarks} of ${assessments} assessments have an official mark`,
    headline: "Most of your work hasn't been officially marked yet.",
    body: `Only ${officialMarks} of your ${assessments} assessments have a released mark, so much of this page rests on a few results and on AI estimates. Expect it to shift as marks arrive.`,
    action: null, evidence: [{ class: "data", label: "Released marks", detail: `${officialMarks} of ${assessments} assessments have an official earned score` }], numbers: [officialMarks, assessments] });

  const thresholds = input.readiness.filter((item) => item.role.tier === "primary").flatMap((role) => role.eligibility.filter((item) => /\d+\+?\s*years/i.test(item.quote)).map((item) => ({ role: role.role.name, quote: item.quote })));
  if (thresholds.length) {
    const years = [...new Set(thresholds.flatMap((item) => [...item.quote.matchAll(/(\d+)\+?\s*years/gi)].map((match) => Number(match[1]))))].sort((a, b) => a - b);
    findings.push({ key: "threat:eligibility", category: "threat", kind: "eligibility", subject: "Experience thresholds", priority: 17, relevance: null,
      keyFact: `Postings ask for ${years.length > 1 ? `${years[0]}–${years.at(-1)}` : years[0]} years' experience`,
      headline: "Some target postings screen on years of experience.",
      body: `Postings for ${list([...new Set(thresholds.map((item) => item.role))])} ask for ${years.length > 1 ? `${years[0]} to ${years.at(-1)}` : years[0]} years. That is a filter, not a skill, so strong coursework won't move it.`,
      action: "Next: shortlist openings at a level whose stated experience matches yours before you apply.",
      evidence: thresholds.slice(0, 4).map((item) => ({ class: "role_requirement" as const, label: item.role, detail: `“${item.quote.slice(0, 200)}”` })), numbers: years });
  }
  if (input.dataQuality.syncWarning) findings.push({ key: "threat:sync", category: "threat", kind: "data_gap", subject: "LMS sync", priority: 12, relevance: null, keyFact: input.dataQuality.syncWarning,
    headline: "Your LMS data may be out of date.", body: `${input.dataQuality.syncWarning} Until the next successful sync, new marks or feedback may be missing here.`, action: "Next: open Marks & LMS sync and check the last run.",
    evidence: [{ class: "data", label: "LMS sync", detail: input.dataQuality.syncWarning }], numbers: [] });
  if (input.dataQuality.heldAssignments) findings.push({ key: "threat:held", category: "threat", kind: "data_gap", subject: "Unfiled assignments", priority: 7, relevance: null, keyFact: `${input.dataQuality.heldAssignments} assignments not linked to a course`,
    headline: "Some assignments aren't counted anywhere yet.", body: `${input.dataQuality.heldAssignments} LMS ${input.dataQuality.heldAssignments === 1 ? "assignment isn't" : "assignments aren't"} linked to a course, so ${input.dataQuality.heldAssignments === 1 ? "it can't" : "they can't"} inform any skill.`, action: "Next: file them in the Evidence library.",
    evidence: [{ class: "data", label: "Unfiled assignments", detail: `${input.dataQuality.heldAssignments} awaiting a course` }], numbers: [input.dataQuality.heldAssignments] });

  return findings.sort((a, b) => b.priority - a.priority).map((finding) => ({ ...finding, numbers: [...new Set(finding.numbers.filter(Number.isFinite).map(round))] }));
}

// The single next step: the highest-priority finding that carries an action, preferring what is holding you back.
export function startHere(findings: Finding[]): Finding | null {
  const actionable = findings.filter((finding) => finding.action);
  const order: SwotCategory[] = ["weakness", "opportunity", "strength", "threat"];
  return [...actionable].sort((a, b) => b.priority - a.priority || order.indexOf(a.category) - order.indexOf(b.category))[0] ?? null;
}

// The deterministic "What stands out" used when no AI-written version is available: the main strength, the most
// important tension and the next priority, each in its own sentence taken from the finding's own wording.
const firstSentence = (text: string) => (text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text).trim();
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
// Skill names read in lower case mid-sentence; course and assessment names keep their capitals.
const subjectOf = (finding: Finding) => /:[a-z]+\.[a-z_]+$/.test(finding.key) ? finding.subject.toLowerCase() : finding.subject;
export function fallbackStandsOut(findings: Finding[]): string {
  const strength = findings.find((finding) => finding.category === "strength");
  const tension = findings.find((finding) => finding.category === "weakness");
  const coverage = findings.find((finding) => finding.kind === "coverage");
  const next = startHere(findings);
  const parts = [
    strength ? `${strength.headline} ${firstSentence(strength.body)}` : "Nothing in your marked work stands out yet as something to build on, which mostly reflects how few results are in.",
    tension && tension !== strength ? `The main tension is ${subjectOf(tension)}: ${lower(firstSentence(tension.body))}` : "No result so far shows a clear shortfall.",
    coverage ? firstSentence(coverage.body).replace(/, so .*$/, ", so expect this picture to move as marks arrive.") : "",
    next ? `If you do one thing next, make it ${subjectOf(next)}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}
