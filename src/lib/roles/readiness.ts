import type { CompetencyState } from "@/lib/competency/classify";
import type { Importance } from "@/lib/roadmap/prioritise";
import type { LibraryRequirement, LibraryRole } from "./library";

export type RequirementStatus = "demonstrated" | "partial" | "gap" | "conflicting" | "supported_claim" | "self_confirmed" | "unverified_claim" | "missing_evidence" | "eligibility" | "unmapped";
export const STATUS_LABELS: Record<RequirementStatus, string> = {
  demonstrated: "Demonstrated",
  partial: "Partly shown",
  gap: "Demonstrated gap",
  conflicting: "Conflicting evidence",
  supported_claim: "Claim backed by other evidence",
  self_confirmed: "Confirmed by you, not independently shown",
  unverified_claim: "Claimed, not yet supported",
  missing_evidence: "No evidence yet",
  eligibility: "Eligibility — check yourself",
  unmapped: "Not linked to a competency",
};
// A demonstrated gap is more informative than an unverified claim, so it ranks above it.
const RANK: RequirementStatus[] = ["demonstrated", "partial", "supported_claim", "conflicting", "gap", "self_confirmed", "unverified_claim", "missing_evidence"];

export type CompetencyView = { state: CompetencyState; name: string };
export type ClaimView = { competencyId: string; status: string };

function statusFor(competencyId: string, competencies: Map<string, CompetencyView>, claims: ClaimView[]): RequirementStatus {
  const state = competencies.get(competencyId)?.state;
  if (state === "demonstrated_strength") return "demonstrated";
  if (state === "emerging" || state === "meets_expectations") return "partial";
  if (state === "development_area") return "gap";
  if (state === "conflicting") return "conflicting";
  const own = claims.filter((claim) => claim.competencyId === competencyId);
  // A claim backed by another evidence item is supported; one only confirmed by the member is kept apart, because
  // saying you have a skill is not the same as showing it.
  if (own.some((claim) => claim.status === "supported")) return "supported_claim";
  if (own.some((claim) => claim.status === "attested")) return "self_confirmed";
  if (own.some((claim) => claim.status === "claimed")) return "unverified_claim";
  return "missing_evidence";
}

export type RequirementReadiness = LibraryRequirement & { status: RequirementStatus; matched?: { shown: number; total: number } };
export type RoleReadiness = { role: LibraryRole; requirements: RequirementReadiness[]; skillRequirements: number; evidenced: number; demonstrated: number; partial: number; claimed: number; selfConfirmed: number; gaps: number; unknown: number; eligibility: RequirementReadiness[] };

const SHOWN: RequirementStatus[] = ["demonstrated", "partial", "supported_claim"];

// A requirement that rests on several competencies needs all of them: it is demonstrated only when every one is,
// a gap or conflict in any of them is reported, and a mix of shown and unshown is "partly shown" with a count.
export function combineStatuses(statuses: RequirementStatus[]): { status: RequirementStatus; matched?: { shown: number; total: number } } {
  if (statuses.length === 1) return { status: statuses[0] };
  const shown = statuses.filter((status) => SHOWN.includes(status)).length;
  const matched = { shown, total: statuses.length };
  if (statuses.every((status) => status === "demonstrated")) return { status: "demonstrated", matched };
  if (statuses.includes("gap")) return { status: "gap", matched };
  if (statuses.includes("conflicting")) return { status: "conflicting", matched };
  if (statuses.some((status) => status === "demonstrated" || status === "partial")) return { status: "partial", matched };
  if (statuses.every((status) => status === "supported_claim")) return { status: "supported_claim", matched };
  // Nothing is shown: report the most informative of the remaining statuses (a claim over no evidence). None of
  // these counts as evidenced.
  return { status: [...statuses].sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0], matched };
}

// Each requirement is judged on all the competencies behind it; eligibility is listed, never scored.
export function roleReadiness(role: LibraryRole, competencies: Map<string, CompetencyView>, claims: ClaimView[]): RoleReadiness {
  const requirements = role.requirements.map((requirement) => {
    if (requirement.eligibility) return { ...requirement, status: "eligibility" as const };
    if (!requirement.competencyIds.length) return { ...requirement, status: "unmapped" as const };
    return { ...requirement, ...combineStatuses(requirement.competencyIds.map((id) => statusFor(id, competencies, claims))) };
  });
  // The same skill asked for in two postings is one requirement: merge requirements that rest on the same
  // competencies, keeping the first quote, so nothing is counted twice.
  const seen = new Set<string>();
  const skill = requirements.filter((item) => item.status !== "eligibility" && item.status !== "unmapped").filter((item) => {
    const key = [...item.competencyIds].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    role,
    requirements,
    skillRequirements: skill.length,
    evidenced: skill.filter((item) => item.status === "demonstrated" || item.status === "partial" || item.status === "supported_claim").length,
    demonstrated: skill.filter((item) => item.status === "demonstrated").length,
    partial: skill.filter((item) => item.status === "partial").length,
    claimed: skill.filter((item) => item.status === "supported_claim").length,
    selfConfirmed: skill.filter((item) => item.status === "self_confirmed").length,
    gaps: skill.filter((item) => item.status === "gap" || item.status === "conflicting").length,
    unknown: skill.filter((item) => item.status === "missing_evidence" || item.status === "unverified_claim" || item.status === "self_confirmed").length,
    eligibility: requirements.filter((item) => item.status === "eligibility"),
  };
}

// Importance for the roadmap: primary-role requirements outrank cross-role ones; course coverage adds a little.
export function importanceFromLibrary(library: LibraryRole[], mappedAssessments: Map<string, number>): Map<string, Importance & { stage: "primary" | "cross" | "course" }> {
  const result = new Map<string, Importance & { stage: "primary" | "cross" | "course" }>();
  const bump = (id: string, weight: number, reason: string, stage: "primary" | "cross") => {
    const current = result.get(id);
    if (!current || weight > current.weight) result.set(id, { weight, reasons: [reason, ...(current?.reasons ?? []).filter((item) => item !== reason)].slice(0, 3), stage: current?.stage === "primary" ? "primary" : stage });
    else if (!current.reasons.includes(reason)) current.reasons.push(reason);
  };
  for (const role of library) for (const requirement of role.requirements) {
    if (requirement.eligibility) continue;
    const primary = role.tier === "primary";
    const weight = (requirement.kind === "preferred" ? 2 : 3) * (primary ? 1 : 0.5);
    for (const id of requirement.competencyIds) bump(id, weight, `${requirement.kind === "preferred" ? "Preferred" : "Required"} by ${role.name}`, primary ? "primary" : "cross");
  }
  for (const [id, count] of mappedAssessments) {
    if (!count) continue;
    const current = result.get(id);
    if (current) { current.weight += 1; if (!current.reasons.includes("Assessed in your courses")) current.reasons.push("Assessed in your courses"); }
    else result.set(id, { weight: 1, reasons: ["Assessed in your courses"], stage: "course" });
  }
  return result;
}
