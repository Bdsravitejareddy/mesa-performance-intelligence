import type { SupabaseClient } from "@supabase/supabase-js";

// The workspace rubric: every weight and threshold the dashboard's calculations use, in one place, editable on
// the Rubric & weights page. Defaults are the dashboard's own conventions, not external standards.
export type Rubric = {
  stakes: { exam: number; graded: number; practice: number };
  aiGradeFactor: number;              // how much a blind AI grade counts next to an official mark (0–1)
  quantShare: number;                 // holistic view: share for marks and tests; the rest goes to the AI's qualitative reading
  reasoningShare: number;             // holistic view: extra weight of reasoning tests in analytical reasoning
  roleThresholds: { core: number; supporting: number; peripheral: number };
  bands: { high: number; low: number }; // competency result bands on the 0–100 scale
};

export const DEFAULT_RUBRIC: Rubric = {
  stakes: { exam: 3, graded: 2, practice: 1 },
  aiGradeFactor: 0.8,
  quantShare: 0.6,
  reasoningShare: 0.15,
  roleThresholds: { core: 75, supporting: 65, peripheral: 50 },
  bands: { high: 85, low: 65 },
};

const num = (value: unknown, fallback: number, min: number, max: number) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

export function sanitizeRubric(raw: unknown): Rubric {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> & unknown>;
  const d = DEFAULT_RUBRIC;
  const stakes = (r.stakes ?? {}) as Record<string, unknown>, roles = (r.roleThresholds ?? {}) as Record<string, unknown>, bands = (r.bands ?? {}) as Record<string, unknown>;
  const high = num(bands.high, d.bands.high, 1, 100), low = num(bands.low, d.bands.low, 0, 99);
  return {
    stakes: { exam: num(stakes.exam, d.stakes.exam, 0, 10), graded: num(stakes.graded, d.stakes.graded, 0, 10), practice: num(stakes.practice, d.stakes.practice, 0, 10) },
    aiGradeFactor: num(r.aiGradeFactor, d.aiGradeFactor, 0, 1),
    quantShare: num(r.quantShare, d.quantShare, 0, 1),
    reasoningShare: num(r.reasoningShare, d.reasoningShare, 0, 1),
    roleThresholds: { core: num(roles.core, d.roleThresholds.core, 0, 100), supporting: num(roles.supporting, d.roleThresholds.supporting, 0, 100), peripheral: num(roles.peripheral, d.roleThresholds.peripheral, 0, 100) },
    bands: low < high ? { high, low } : d.bands,
  };
}

export async function loadRubric(client: SupabaseClient): Promise<Rubric> {
  const { data, error } = await client.from("rubric_settings").select("settings").eq("id", "workspace").maybeSingle();
  return error || !data ? DEFAULT_RUBRIC : sanitizeRubric(data.settings);
}
