import type { SupabaseClient } from "@supabase/supabase-js";
import { runBehaviourAnalysis } from "./run";
import { runContextReading } from "@/lib/tests/context-reading";

// After new written context (a questionnaire note or an assistant profile): re-run the behaviour analysis,
// keeping the member's earlier choice about their own AI conversations, then the context personality reading.
export async function refreshReadings(supabase: SupabaseClient, userId: string) {
  const { data: last } = await supabase.from("behaviour_analyses").select("included_conversations").order("created_at", { ascending: false }).limit(1).maybeSingle();
  await runBehaviourAnalysis(supabase, userId, last?.included_conversations === true).catch(() => undefined);
  await runContextReading(supabase, userId).catch(() => undefined);
}
