import type { CompetencyDomain } from "@/lib/competency/map";

// Which competency this week's practice works on: conflicting results first (the evidence disagrees and practice
// can settle it), then a demonstrated development area, then a skill your target roles need with a low or no
// signal. The reason is stated in plain words on the practice page.
export type PracticeTarget = { id: string; name: string; description: string; domain: string; reason: string; assessmentIds: string[] };

export function chooseTarget(domains: CompetencyDomain[], roleNeeds: Set<string>): PracticeTarget | null {
  const entries = domains.flatMap((domain) => domain.competencies.map((entry) => ({ ...entry, domainName: domain.name })));
  const rank = (entry: (typeof entries)[number]) => {
    const state = entry.assessment.state;
    const lowSignal = entry.assessment.why.evidence.some((row) => row.band === "low");
    if (state === "conflicting") return 0;
    if (state === "development_area") return 1;
    if (state === "insufficient_evidence" && lowSignal) return 2;
    if (state === "insufficient_evidence" && roleNeeds.has(entry.id) && entry.mappedAssessments > 0) return 3;
    if (state === "meets_expectations" && roleNeeds.has(entry.id)) return 4;
    return 9;
  };
  const ranked = entries.filter((entry) => rank(entry) < 9).sort((a, b) => rank(a) - rank(b) || Number(roleNeeds.has(b.id)) - Number(roleNeeds.has(a.id)) || b.mappedAssessments - a.mappedAssessments);
  const pick = ranked[0];
  if (!pick) return null;
  const why = { 0: `your results disagree (${pick.assessment.headline.toLowerCase()})`, 1: `it is a development area (${pick.assessment.headline.toLowerCase()})`, 2: "one low result needs checking", 3: "your target roles need it and nothing has shown it yet", 4: "your target roles need it and results so far are only mid-range" }[rank(pick) as 0 | 1 | 2 | 3 | 4];
  return { id: pick.id, name: pick.name, description: pick.description, domain: pick.domainName, reason: `${pick.name}: ${why}.`, assessmentIds: [...new Set(pick.assessment.why.evidence.map((row) => row.assessmentId).filter((id) => !id.startsWith("test:")))] };
}

// An everyday reflection tied to the competency (not work), so the conversational prompt is personal too.
export function reflectionPrompt(target: PracticeTarget): string {
  const meaning = target.description.replace(/\.$/, "");
  return `Outside work or study, tell the story of a time when ${target.name.toLowerCase()} mattered (${meaning.charAt(0).toLowerCase()}${meaning.slice(1)}). What did you do first, and what would you do differently now?`;
}
