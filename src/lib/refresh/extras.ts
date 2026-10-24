import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshGithub } from "@/lib/portfolio/github";
import { evaluateProjects } from "@/lib/portfolio/evaluate";
import { runBehaviourAnalysis } from "@/lib/behaviour/run";
import { runContextReading } from "@/lib/tests/context-reading";
import { isProviderConfigured } from "@/lib/ai/settings";
import { runAiSkillView } from "@/lib/profile/skills";

// The last stage of the daily (or manual) refresh, after the LMS sync and grading: re-read GitHub, evaluate
// changed projects, then re-run the behaviour analysis and the context reading on everything now known.
export async function refreshExtras(admin: SupabaseClient, budgetMs: number) {
  const deadline = Date.now() + budgetMs;
  const { data: owner } = await admin.from("sync_runs").select("user_id").order("started_at", { ascending: false }).limit(1).maybeSingle();
  const userId = owner?.user_id as string | undefined;
  const step = async <T,>(run: () => Promise<T>) => { try { return await run(); } catch (error) { return { error: error instanceof Error ? error.message.slice(0, 200) : "failed" }; } };
  const github = await step(() => refreshGithub(admin, deadline - 200_000));
  if (!userId || !isProviderConfigured()) return { github, projects: null, behaviour: null, context: null };
  // Project evaluation runs as its own chained stage (see the refresh route), so it can finish every project.
  const projects = { delegated: true };
  const { data: last } = await admin.from("behaviour_analyses").select("included_conversations").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const behaviour = Date.now() < deadline - 120_000 ? await step(() => runBehaviourAnalysis(admin, userId, last?.included_conversations === true)) : { skipped: "out of time" };
  const context = Date.now() < deadline - 40_000 ? await step(() => runContextReading(admin, userId)) : { skipped: "out of time" };
  return { github, projects, behaviour, context };
}

// The AI's reading of each skill domain runs as its own stage: it reads every source and needs the time.
export async function refreshSkillView(admin: SupabaseClient) {
  const { data: owner } = await admin.from("sync_runs").select("user_id").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!owner || !isProviderConfigured()) return { skipped: true };
  const { data: rows } = await admin.from("competencies").select("domain_name");
  const domains = [...new Set((rows ?? []).map((row) => row.domain_name as string))];
  return runAiSkillView(admin, owner.user_id as string, domains);
}

// One pass of project evaluation; the route chains further passes while projects remain.
export async function refreshProjects(admin: SupabaseClient) {
  const { data: owner } = await admin.from("sync_runs").select("user_id").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!owner || !isProviderConfigured()) return { evaluated: 0, unchanged: 0, skipped: 0 };
  return evaluateProjects(admin, owner.user_id as string, 270_000);
}
