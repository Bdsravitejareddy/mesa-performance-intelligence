import research from "./research.json";

// Curated role benchmarks built from real postings (verbatim quotes, source URLs, retrieval date).
// Requirements are mapped to competencies by the keyword table below so every mapping is inspectable.

export type RequirementKind = "required" | "preferred" | "responsibility";
export type LibraryRequirement = { quote: string; kind: RequirementKind; competencyIds: string[]; eligibility: boolean; source: { employer: string; title: string; url: string } };
export type LibraryRole = { key: string; name: string; tier: "primary" | "cross"; postings: { employer: string; title: string; url: string; retrievedAt: string; postingDate: string | null }[]; requirements: LibraryRequirement[]; competencies: string[] };

// Targets the user chose: primary roles first, then roles that share most of their competencies.
export const PRIMARY_ROLES = ["Senior Technical Product Manager", "Forward Deployed Engineer"];
export const CROSS_ROLES = ["Head of Product", "Group Product Manager", "Technical Program Manager", "Solutions Architect", "Chief of Staff"];

// First matching rules win; at most two competencies per requirement.
const RULES: [RegExp, string][] = [
  [/\bsql\b|database|data warehouse|\bbi\b/i, "technical.sql"],
  [/python|programming|coder|javascript|typescript|java\b|c\+\+|c#/i, "technical.python"],
  [/\bllm|\bai\b|ai-|claude|machine learning|\bml\b|generative|agent/i, "technical.ai"],
  [/cloud|distributed|infrastructure|architect|integration|systems|security|storage/i, "technical.systems_understanding"],
  [/analytic|large scale data|data-|data structures|data integrity|metrics|evaluation criteria|baselines|dashboards?/i, "technical.analytics"],
  [/prioriti[sz]/i, "product.prioritisation"],
  [/customer|user experience|insights from|discovery|requirements/i, "product.customer_needs"],
  [/experiment|conversion|funnel/i, "product.metrics"],
  [/vision|strategy|roadmap|define your product|product offering|p&l/i, "business.strategy"],
  [/revenue|financial|banking|payments|p&l|sell/i, "business.finance"],
  [/negotiat|influence|persua/i, "communication.persuasion"],
  [/stakeholder|executive|cross-functional|partner|collaborat|non-technical/i, "communication.stakeholder_management"],
  [/communicat|writing|slide decks|narrative|translate/i, "communication.clarity"],
  [/lead (a|and)|leading|coach|managing (other )?product managers|org design|recruit|hiring|team of/i, "leadership.collaboration"],
  [/\bown(s|ed|ing)?\b|\bowner|self-starter|agency|taking action|accountab/i, "leadership.ownership"],
  [/ambiguity|judg(e)?ment|dynamic environment|evolving|sounding board|simplify complex/i, "decision.judgement"],
  [/execution|deliver|ship|launch|implementation|roll out|prototype|proof-of-concept|build production/i, "execution.implementation"],
  [/operations|supply chain|manufacturing|workflow|process|mrp|erp|procure/i, "execution.operations"],
];
// Experience length, degrees, travel and domain background describe eligibility, not demonstrable skill.
const ELIGIBILITY = /^\s*(\d+\+?\s*years|bachelor|relevant technical degree|mba|ability and interest to travel|travel|relevant experience)|\byears' experience\b|\d+\+ years/i;

export function mapRequirement(quote: string): { competencyIds: string[]; eligibility: boolean } {
  const competencyIds: string[] = [];
  for (const [pattern, id] of RULES) if (pattern.test(quote) && !competencyIds.includes(id)) { competencyIds.push(id); if (competencyIds.length === 2) break; }
  return { competencyIds, eligibility: ELIGIBILITY.test(quote) };
}

type Posting = { role: string; title: string; employer: string; url: string; postingDate: string | null; retrievedAt: string; requirements: { quote: string; kind: RequirementKind }[] };

export function buildLibrary(postings: Posting[] = research as Posting[]): LibraryRole[] {
  const names = [...PRIMARY_ROLES, ...CROSS_ROLES];
  return names.flatMap((name) => {
    const forRole = postings.filter((posting) => posting.role === name);
    if (!forRole.length) return [];
    const requirements = forRole.flatMap((posting) => posting.requirements.map((requirement) => ({ quote: requirement.quote, kind: requirement.kind, ...mapRequirement(requirement.quote), source: { employer: posting.employer, title: posting.title, url: posting.url } })));
    return [{
      key: name.toLowerCase().replace(/[^a-z]+/g, "-"),
      name,
      tier: PRIMARY_ROLES.includes(name) ? "primary" as const : "cross" as const,
      postings: forRole.map(({ employer, title, url, retrievedAt, postingDate }) => ({ employer, title, url, retrievedAt, postingDate })),
      requirements,
      competencies: [...new Set(requirements.filter((item) => !item.eligibility).flatMap((item) => item.competencyIds))],
    }];
  });
}

// Share of a cross role's competencies that the primary targets already require.
export function overlapWithPrimary(role: LibraryRole, library: LibraryRole[]): { shared: string[]; share: number } {
  const primary = new Set(library.filter((item) => item.tier === "primary").flatMap((item) => item.competencies));
  const shared = role.competencies.filter((id) => primary.has(id));
  return { shared, share: role.competencies.length ? Math.round((shared.length / role.competencies.length) * 100) : 0 };
}
