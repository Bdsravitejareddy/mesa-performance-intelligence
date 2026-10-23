import type { CompetencyState } from "@/lib/competency/classify";
import type { Importance } from "@/lib/roadmap/prioritise";
import type { LibraryRequirement, LibraryRole } from "./library";

export type RequirementStatus = "demonstrated" | "partial" | "gap" | "conflicting" | "supported_claim" | "unverified_claim" | "missing_evidence" | "eligibility" | "unmapped";
export const STATUS_LABELS: Record<RequirementStatus, string> = {
  demonstrated: "Demonstrated",
  partial: "Partly shown",
  gap: "Demonstrated gap",
  conflicting: "Conflicting evidence",
  supported_claim: "Supported claim",
  unverified_claim: "Claimed, not yet supported",
  missing_evidence: "No evidence yet",
  eligibility: "Eligibility — check yourself",
  unmapped: "Not linked to a competency",
};
// A demonstrated gap is more informative than an unverified claim, so it ranks above it.
const RANK: RequirementStatus[] = ["demonstrated", "partial", "supported_claim", "conflicting", "gap", "unverified_claim", "missing_evidence"];

export type CompetencyView = { state: CompetencyState; name: string };
export type ClaimView = { competencyId: string; status: string };

function statusFor(competencyId: string, competencies: Map<string, CompetencyView>, claims: ClaimView[]): RequirementStatus {
  const state = competencies.get(competencyId)?.state;
  if (state === "demonstrated_strength") return "demonstrated";
  if (state === "emerging" || state === "meets_expectations") return "partial";
  if (state === "development_area") return "gap";
  if (state === "conflicting") return "conflicting";
  const own = claims.filter((claim) => claim.competencyId === competencyId);
  // Claims backed by another evidence item, or confirmed as accurate by the member, count as supported.
  if (own.some((claim) => claim.status === "supported" || claim.status === "attested")) return "supported_claim";
  if (own.some((claim) => claim.status === "claimed")) return "unverified_claim";
  return "missing_evidence";
}

export type RequirementReadiness = LibraryRequirement & { status: RequirementStatus };
export type RoleReadiness = { role: LibraryRole; requirements: RequirementReadiness[]; skillRequirements: number; evidenced: number; demonstrated: number; partial: number; claimed: number; gaps: number; unknown: number; eligibility: RequirementReadiness[] };

// The best-evidenced competency behind a requirement decides its status; eligibility is listed, never scored.
export function roleReadiness(role: LibraryRole, competencies: Map<string, CompetencyView>, claims: ClaimView[]): RoleReadiness {
  const requirements = role.requirements.map((requirement) => {
    if (requirement.eligibility) return { ...requirement, status: "eligibility" as const };
    if (!requirement.competencyIds.length) return { ...requirement, status: "unmapped" as const };
    const statuses = requirement.competencyIds.map((id) => statusFor(id, competencies, claims)).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b));
    return { ...requirement, status: statuses[0] };
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
    gaps: skill.filter((item) => item.status === "gap" || item.status === "conflicting").length,
    unknown: skill.filter((item) => item.status === "missing_evidence" || item.status === "unverified_claim").length,
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
