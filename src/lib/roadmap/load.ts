import type { SupabaseClient } from "@supabase/supabase-js";
import { evidenceFingerprintOf } from "@/lib/competency/history";
import { loadCompetencyInputs } from "@/lib/competency/load";
import { buildCompetencyMap, type CompetencyMapEntry } from "@/lib/competency/map";
import { importanceFrom, recommend, type CompetencyInput } from "./prioritise";

export function toRoadmapInput(entry: CompetencyMapEntry & { domain: string }): CompetencyInput {
  const evidence = entry.assessment.why.evidence;
  return { id: entry.id, name: entry.name, domain: entry.domain, state: entry.assessment.state, confidence: entry.assessment.confidence, headline: entry.assessment.headline, mappedAssessments: entry.mappedAssessments, hasLowResult: evidence.some((row) => row.band === "low"), courses: [...new Set(evidence.map((row) => row.course))] };
}

export async function loadRoadmap(supabase: SupabaseClient) {
  const [inputs, roles, actions] = await Promise.all([
    loadCompetencyInputs(supabase),
    supabase.from("role_profiles").select("title, competencies"),
    supabase.from("roadmap_actions").select("id, competency_id, activity, activity_kind, rationale, priority, effort_hours, status, start_state, start_evidence_fingerprint, outcome, created_at, completed_at").order("created_at", { ascending: false }),
  ]);
  if (actions.error) throw new Error("Could not load the roadmap. Check that the roadmap migration is applied.");
  const entries = buildCompetencyMap(inputs).flatMap((domain) => domain.competencies.map((entry) => ({ ...entry, domain: domain.name })));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const requirements = (roles.data ?? []).flatMap((role) => (Array.isArray(role.competencies) ? role.competencies as Record<string, unknown>[] : []).map((item) => ({ text: [item.title, item.description, item.sourceQuote].filter((value) => typeof value === "string").join(" "), required: item.evidenceKind === "required", role: role.title as string })));
  const importance = importanceFrom(entries.map((entry) => ({ id: entry.id, name: entry.name, mappedAssessments: entry.mappedAssessments })), requirements);
  const active = new Set((actions.data ?? []).filter((row) => row.status === "planned" || row.status === "in_progress").map((row) => row.competency_id as string));
  const plan = (actions.data ?? []).map((row) => {
    const current = byId.get(row.competency_id as string);
    return { ...row, competency: current?.name ?? row.competency_id, currentState: current?.assessment.state ?? null, currentFingerprint: current ? evidenceFingerprintOf(current.assessment.why.evidence) : "" };
  });
  return { recommendations: recommend(entries.map(toRoadmapInput), importance, active), plan, hasRoles: requirements.length > 0 };
}

export async function startingPoint(supabase: SupabaseClient, competencyId: string) {
  const entry = buildCompetencyMap(await loadCompetencyInputs(supabase)).flatMap((domain) => domain.competencies).find((item) => item.id === competencyId);
  if (!entry) return null;
  return { state: entry.assessment.state, fingerprint: evidenceFingerprintOf(entry.assessment.why.evidence) };
}
