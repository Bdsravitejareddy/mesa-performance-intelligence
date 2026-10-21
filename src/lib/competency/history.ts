import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RULES_VERSION, type CompetencyState, type Confidence } from "./classify";
import { loadCompetencyInputs } from "./load";
import { buildCompetencyMap, type CompetencyDomain, type MappingRow } from "./map";

export type SnapshotRow = {
  competency_id: string;
  state: CompetencyState;
  confidence: Confidence;
  headline: string;
  evidence_count: number;
  scored_count: number;
  evidence_fingerprint: string;
  mapping_fingerprint: string;
  rules_version: string;
  reason: "initial" | "evidence_changed" | "mapping_changed" | "rules_changed";
  recorded_at?: string;
};

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Rows to append: only competencies whose conclusion, evidence, mapping or rules changed since their latest snapshot.
// A competency that has never had evidence and still has none is not recorded.
export function snapshotChanges(domains: CompetencyDomain[], mappings: MappingRow[], latest: Map<string, SnapshotRow>): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  for (const competency of domains.flatMap((domain) => domain.competencies)) {
    const evidence = competency.assessment.why.evidence;
    const mappingFingerprint = sha(mappings.filter((row) => row.competency_id === competency.id && row.review_status === "accepted").map((row) => [row.assessment_id, row.criterion_label ?? "", row.mapping_source]).sort());
    const evidenceFingerprint = sha(evidence.map((row) => [row.assessmentId, row.submissionId, row.criterionLabel ?? "", row.mark, row.date]).sort());
    const previous = latest.get(competency.id);
    const next = {
      competency_id: competency.id,
      state: competency.assessment.state,
      confidence: competency.assessment.confidence,
      headline: competency.assessment.headline.slice(0, 300),
      evidence_count: evidence.length,
      scored_count: evidence.filter((row) => row.mark !== null).length,
      evidence_fingerprint: evidenceFingerprint,
      mapping_fingerprint: mappingFingerprint,
      rules_version: RULES_VERSION,
    };
    if (!previous) {
      if (evidence.length) rows.push({ ...next, reason: "initial" });
      continue;
    }
    const reason = previous.rules_version !== RULES_VERSION ? "rules_changed"
      : previous.mapping_fingerprint !== mappingFingerprint ? "mapping_changed"
      : previous.evidence_fingerprint !== evidenceFingerprint ? "evidence_changed"
      : null;
    if (reason) rows.push({ ...next, reason });
  }
  return rows;
}

// Recomputes conclusions and appends changed ones. Failures are reported to the caller, never swallowed silently.
export async function recordCompetencySnapshots(supabase: SupabaseClient, userId: string): Promise<number> {
  const inputs = await loadCompetencyInputs(supabase);
  const domains = buildCompetencyMap(inputs);
  const { data, error } = await supabase.from("competency_snapshots").select("competency_id, state, confidence, headline, evidence_count, scored_count, evidence_fingerprint, mapping_fingerprint, rules_version, reason, recorded_at").order("recorded_at", { ascending: false }).limit(2000);
  if (error) throw new Error("Competency history could not be loaded.");
  const latest = new Map<string, SnapshotRow>();
  for (const row of (data ?? []) as SnapshotRow[]) if (!latest.has(row.competency_id)) latest.set(row.competency_id, row);
  const rows = snapshotChanges(domains, inputs.mappings, latest);
  if (!rows.length) return 0;
  const { error: insertError } = await supabase.from("competency_snapshots").insert(rows.map((row) => ({ ...row, user_id: userId })));
  if (insertError) throw new Error("Competency history could not be saved.");
  return rows.length;
}
