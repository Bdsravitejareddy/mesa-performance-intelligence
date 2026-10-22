import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";
import { analyseBehaviour, gatherSources } from "@/lib/behaviour/analyse";

export const maxDuration = 120;

// Runs a new behaviour analysis; earlier runs are kept for comparison.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const config = getAIProcessingConfig();
  const { data: consent } = await supabase.from("ai_processing_consents").select("disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at").eq("user_id", userId).maybeSingle();
  if (!config.configured || !isAIConsentCurrent(consent, config)) return NextResponse.json({ error: "Accept the AI processing disclosure first." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { includeConversations?: unknown };
  const includeConversations = body.includeConversations === true;
  try {
    const sources = await gatherSources(supabase, { includeConversations });
    const { dimensions, inputHash } = await analyseBehaviour(sources);
    const counts = sources.reduce<Record<string, number>>((all, source) => ({ ...all, [source.kind]: (all[source.kind] ?? 0) + 1 }), {});
    const { error } = await supabase.from("behaviour_analyses").insert({ user_id: userId, dimensions: dimensions.map((item) => ({ ...item, observations: item.observations.map((observation) => ({ ...observation, label: sources.find((source) => source.id === observation.sourceId)?.label ?? "" })) })), source_counts: counts, input_hash: inputHash, provider_model: config.model, included_conversations: includeConversations });
    if (error) return NextResponse.json({ error: "The analysis ran but could not be saved." }, { status: 500 });
    return NextResponse.json({ ok: true, observed: dimensions.filter((item) => item.status === "observed").length, sources: counts }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The analysis failed; try again." }, { status: 502 });
  }
}
