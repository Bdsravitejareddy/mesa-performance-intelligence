import type { CompetencyAssessment, CompetencyState, EvidenceRow } from "./classify";

// One reading of every competency, shared by the Skills, SWOT, Career and Roadmap pages, so a skill called a
// strength or a gap on one page is never contradicted on another. It only relabels the classifier's state.
export type Standing = "strength" | "gap" | "emerging" | "mixed" | "steady" | "unknown";
export const STANDING_OF: Record<CompetencyState, Standing> = { demonstrated_strength: "strength", development_area: "gap", emerging: "emerging", conflicting: "mixed", meets_expectations: "steady", insufficient_evidence: "unknown" };

// True when every counted result is a blind AI grade: the conclusion stands, but it must say so wherever it is shown.
export const aiOnly = (assessment: CompetencyAssessment) => assessment.why.counted.length > 0 && assessment.why.counted.every((row) => row.evidenceKind === "ai_grade");
export const AI_ONLY_NOTE = "from AI grading only, not yet confirmed by an official mark";

// Counts of the counted list, by band; headlines and summaries use these so they match the list shown.
export function bandCounts(rows: EvidenceRow[]) {
  return { high: rows.filter((row) => row.band === "high").length, middle: rows.filter((row) => row.band === "middle").length, low: rows.filter((row) => row.band === "low").length };
}

// The anchor of a skill's row on the Skills page, so other pages can link straight to it.
export const skillAnchor = (id: string) => `skill-${id.replace(/[^a-z0-9]+/gi, "-")}`;
export const skillHref = (id: string) => `/competencies#${skillAnchor(id)}`;

// Skill names mid-sentence: lower case, but acronyms such as AI or SQL keep their capitals.
export const skillPhrase = (name: string) => name.split(" ").map((word) => /^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase()).join(" ");

export type SkillSummary = { strengths: { id: string; name: string; aiOnly: boolean }[]; gaps: { id: string; name: string; aiOnly: boolean }[]; mixed: { id: string; name: string }[]; emerging: { id: string; name: string }[]; unknown: number; total: number };

// The at-a-glance summary: what is a strength, what needs work and how much is not yet known.
export function summariseSkills(entries: { id: string; name: string; assessment: CompetencyAssessment }[]): SkillSummary {
  const of = (standing: Standing) => entries.filter((entry) => STANDING_OF[entry.assessment.state] === standing);
  return {
    // Official evidence first: an AI-only strength is listed after the ones a mark confirms.
    strengths: of("strength").map((entry) => ({ id: entry.id, name: entry.name, aiOnly: aiOnly(entry.assessment) })).sort((a, b) => Number(a.aiOnly) - Number(b.aiOnly)),
    gaps: of("gap").map((entry) => ({ id: entry.id, name: entry.name, aiOnly: aiOnly(entry.assessment) })).sort((a, b) => Number(a.aiOnly) - Number(b.aiOnly)),
    mixed: of("mixed").map(({ id, name }) => ({ id, name })),
    emerging: of("emerging").map(({ id, name }) => ({ id, name })),
    unknown: of("unknown").length,
    total: entries.length,
  };
}

// Project languages that speak to a technical skill. Project use is context beside a skill, never a mark.
const LANGUAGE_SKILLS: Record<string, string[]> = { "technical.python": ["Python", "Jupyter Notebook"], "technical.sql": ["SQL", "PLpgSQL", "TSQL", "PLSQL"] };
export function projectContext(competencyId: string, languages: { name: string; projects: number }[]): { language: string; projects: number } | null {
  const names = LANGUAGE_SKILLS[competencyId];
  if (!names) return null;
  const best = languages.filter((item) => names.includes(item.name)).sort((a, b) => b.projects - a.projects)[0];
  return best ? { language: best.name, projects: best.projects } : null;
}
export const projectNote = (context: { language: string; projects: number }) => `${context.projects} of your GitHub projects use ${context.language} (project work, not a mark)`;
