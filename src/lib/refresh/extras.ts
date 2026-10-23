import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshGithub } from "@/lib/portfolio/github";
import { evaluateProjects } from "@/lib/portfolio/evaluate";
import { runBehaviourAnalysis } from "@/lib/behaviour/run";
import { runContextReading } from "@/lib/tests/context-reading";
import { isProviderConfigured } from "@/lib/ai/settings";

// The last stage of the daily (or manual) refresh, after the LMS sync and grading: re-read GitHub, evaluate
// changed projects, then re-run the behaviour analysis and the context reading on everything now known.
export async function refreshExtras(admin: SupabaseClient, budgetMs: number) {
  const deadline = Date.now() + budgetMs;
  const { data: owner } = await admin.from("sync_runs").select("user_id").order("started_at", { ascending: false }).limit(1).maybeSingle();
  const userId = owner?.user_id as string | undefined;
  const step = async <T,>(run: () => Promise<T>) => { try { return await run(); } catch (error) { return { error: error instanceof Error ? error.message.slice(0, 200) : "failed" }; } };
  const github = await step(() => refreshGithub(admin, deadline - 200_000));
  if (!userId || !isProviderConfigured()) return { github, projects: null, behaviour: null, context: null };
  const projects = await step(() => evaluateProjects(admin, userId, Math.max(0, deadline - Date.now() - 140_000)));
  const { data: last } = await admin.from("behaviour_analyses").select("included_conversations").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const behaviour = Date.now() < deadline - 120_000 ? await step(() => runBehaviourAnalysis(admin, userId, last?.included_conversations === true)) : { skipped: "out of time" };
  const context = Date.now() < deadline - 40_000 ? await step(() => runContextReading(admin, userId)) : { skipped: "out of time" };
  return { github, projects, behaviour, context };
}
