import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";
import { analyseBehaviour, gatherSources } from "./analyse";

export type BehaviourRun = { ok: true; observed: number; sources: Record<string, number> } | { ok: false; status: number; error: string };

// One behaviour analysis for a signed-in member; earlier runs are kept for comparison.
export async function runBehaviourAnalysis(supabase: SupabaseClient, userId: string, includeConversations: boolean): Promise<BehaviourRun> {
  const config = getAIProcessingConfig();
  const { data: consent } = await supabase.from("ai_processing_consents").select("disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at").eq("user_id", userId).maybeSingle();
  if (!config.configured || !isAIConsentCurrent(consent, config)) return { ok: false, status: 403, error: "Accept the AI processing disclosure first." };
  try {
    const sources = await gatherSources(supabase, { includeConversations });
    const { dimensions, inputHash } = await analyseBehaviour(sources);
    const counts = sources.reduce<Record<string, number>>((all, source) => ({ ...all, [source.kind]: (all[source.kind] ?? 0) + 1 }), {});
    const { error } = await supabase.from("behaviour_analyses").insert({ user_id: userId, dimensions: dimensions.map((item) => ({ ...item, observations: item.observations.map((observation) => ({ ...observation, label: sources.find((source) => source.id === observation.sourceId)?.label ?? "" })) })), source_counts: counts, input_hash: inputHash, provider_model: config.model, included_conversations: includeConversations });
    if (error) return { ok: false, status: 500, error: "The analysis ran but could not be saved." };
    return { ok: true, observed: dimensions.filter((item) => item.status === "observed").length, sources: counts };
  } catch {
    return { ok: false, status: 502, error: "The analysis failed; try again." };
  }
}
