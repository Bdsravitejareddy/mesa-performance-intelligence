import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompetencyInputs } from "@/lib/competency/load";
import { buildCompetencyMap } from "@/lib/competency/map";
import { holistic, markedView, type AiDomain, type SkillView } from "./skills";
import type { SixteenP } from "@/lib/tests/external";
import { FACTOR_LABELS, type Factor } from "@/lib/tests/personality";
import type { ContextFactor } from "@/lib/tests/context-reading";
import type { Level } from "@/lib/tests/reasoning";

// The figures behind the profile infographics: personality (self-report and written context), reasoning by
// section and level, and skills by competency domain. Every value is either measured or null — never filled in.
export type Glance = {
  self: Record<Factor, number> | null; selfDate: string | null; note: string;
  context: { factors: Record<Factor, ContextFactor>; summary: string; date: string; sources: { id: string; label: string }[] } | null;
  reasoning: { level: Level; date: string; sections: Record<"numerical" | "logical" | "verbal", number>; correct: number; total: number; scaled: number | null }[];
  // Three views per skill domain (see skills.ts): marked, the AI's reading, and the holistic blend.
  skills: SkillView[];
  aiViewDate: string | null;
  external: { sixteenP: SixteenP | null; clifton: string[] };
  behaviour: { observed: number; total: number; date: string | null; dimensions: { dimension: string; status: string; observedBehaviour: string }[] };
};

export const FACTORS = Object.keys(FACTOR_LABELS) as Factor[];

export async function loadGlance(supabase: SupabaseClient): Promise<Glance> {
  const [personality, readings, reasoning, behaviour] = await Promise.all([
    supabase.from("test_attempts").select("result, submitted_at").eq("kind", "personality").not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(5),
    supabase.from("personality_readings").select("factors, summary, sources, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("test_attempts").select("result, submitted_at").eq("kind", "reasoning").not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(20),
    supabase.from("behaviour_analyses").select("dimensions, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // The latest questionnaire on the 1–5 scale; the older 20-item form (4–20 sums) is converted to the same scale.
  const latest = (personality.data ?? [])[0] as { result: { factors?: Record<string, { score: number }>; scale?: string; note?: string }; submitted_at: string } | undefined;
  const self = latest?.result.factors ? Object.fromEntries(FACTORS.map((factor) => {
    const score = latest.result.factors![factor]?.score ?? 0;
    return [factor, latest.result.scale === "mean_1_5" ? score : Math.round((score / 4) * 100) / 100];
  })) as Record<Factor, number> : null;

  // Latest attempt per level, so standard and harder results can be drawn side by side.
  const perLevel = new Map<Level, Glance["reasoning"][number]>();
  for (const row of (reasoning.data ?? []) as { result: { level?: Level; sections: Record<string, { percent: number }>; correct: number; total: number; ability?: { scaled: number } }; submitted_at: string }[]) {
    const level = row.result.level ?? "standard";
    if (perLevel.has(level)) continue;
    perLevel.set(level, { level, date: row.submitted_at, correct: row.result.correct, total: row.result.total, scaled: row.result.ability?.scaled ?? null, sections: { numerical: row.result.sections.numerical?.percent ?? 0, logical: row.result.sections.logical?.percent ?? 0, verbal: row.result.sections.verbal?.percent ?? 0 } });
  }

  let skills: Glance["skills"] = [];
  const { data: aiView } = await supabase.from("ai_skill_views").select("domains, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const aiDomains = (aiView?.domains ?? {}) as Record<string, AiDomain>;
  const reasoningRows = [...perLevel.values()];
  const reasoningScore = reasoningRows.length ? Math.round(reasoningRows.reduce((sum, row) => sum + (row.correct / row.total) * 100, 0) / reasoningRows.length) : null;
  try {
    const inputs = await loadCompetencyInputs(supabase);
    const domains = buildCompetencyMap(inputs);
    const marked = markedView(domains, inputs.rubric);
    skills = domains.map((domain) => { const view = marked.get(domain.name) ?? { score: null, evidence: 0 }; const ai = aiDomains[domain.name] ?? null; return { domain: domain.name, marked: view.score, markedEvidence: view.evidence, ai, holistic: holistic(view, ai, reasoningScore, domain.name, inputs.rubric) }; });
  } catch { skills = []; }

  const dimensions = ((behaviour.data?.dimensions ?? []) as Glance["behaviour"]["dimensions"]);
  const reading = readings.data as { factors: Record<Factor, ContextFactor>; summary: string; sources: { id: string; label: string }[]; created_at: string } | null;
  return {
    self, selfDate: latest?.submitted_at ?? null, note: latest?.result.note ?? "",
    context: reading ? { factors: reading.factors, summary: reading.summary, date: reading.created_at, sources: reading.sources } : null,
    reasoning: (["standard", "hard", "extreme"] as Level[]).map((level) => perLevel.get(level)).filter((row): row is Glance["reasoning"][number] => Boolean(row)),
    skills, aiViewDate: (aiView?.created_at as string | undefined) ?? null,
    external: await (async () => { const { data } = await supabase.from("external_assessments").select("kind, result").order("created_at", { ascending: false }).limit(6); const of = (kind: string) => (data ?? []).find((row) => row.kind === kind)?.result as Record<string, unknown> | undefined; return { sixteenP: (of("16personalities") as SixteenP | undefined) ?? null, clifton: ((of("cliftonstrengths")?.themes ?? []) as string[]) }; })(),
    behaviour: { observed: dimensions.filter((row) => row.status === "observed").length, total: dimensions.length, date: behaviour.data?.created_at as string ?? null, dimensions },
  };
}
