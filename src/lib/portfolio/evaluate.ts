import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProcessingConfig } from "@/lib/ai/consent";
import { blindEvaluate, BLIND_PROMPT_VERSION, type BlindReport, type Standard } from "@/lib/quality/engine";
import { summarisePortfolio, type PortfolioRow, type Project } from "./summary";

// A blind, grounded evaluation of each self-directed project. The problem statement the member was given is the
// task the project is judged against — never part of the work, so it cannot be quoted as their communication.
// The work is the project's facts, its README opening and, separately, anything the member wrote in their own
// words; communication and first-principles criteria are scored only from their own words.
export type ProjectContext = { project_key: string; kind: "problem_statement" | "own_words"; title: string; body: string };
export const PROJECT_RULES_VERSION = "project-eval-v1";
const OWN_WORDS_CRITERIA = new Set(["Communication of reasoning", "First-principles reasoning"]);

export function projectStandard(hasStatement: boolean, hasOwnWords: boolean): Standard {
  const criteria = [
    { name: "Problem understanding", description: "Is the problem, its user and its constraints clearly understood and framed?", weight: 2 },
    { name: "Solution design", description: "Does the design fit the problem, with sensible scope and trade-offs?", weight: 2 },
    { name: "AI integration", description: "Is AI used where it adds value, with appropriate safeguards, rather than for its own sake?", weight: 1 },
    { name: "Delivery and shipping", description: "Was it built to a working, deployed state and iterated on?", weight: 1 },
    ...(hasStatement ? [{ name: "Fit to the problem statement", description: "Does the project address what the given problem statement asks for?", weight: 2 }] : []),
    ...(hasOwnWords ? [
      { name: "Communication of reasoning", description: "In the member's own words: is the reasoning clear, structured and tied to evidence?", weight: 1 },
      { name: "First-principles reasoning", description: "In the member's own words: does the reasoning break the problem into fundamentals rather than copying patterns?", weight: 1 },
    ] : []),
  ];
  return { source: "model_general", label: hasStatement ? "Project criteria (dashboard default) judged against the problem statement you were given" : "Project criteria (dashboard default); no problem statement added", criteria };
}

export function projectWork(project: Project, ownWords: ProjectContext[]): { work: string; ownText: string } {
  const facts = [
    `Project: ${project.name}`,
    project.description && `Description: ${project.description}`,
    project.languages.length && `Languages: ${project.languages.join(", ")}`,
    project.aiPackages.length && `AI libraries used: ${project.aiPackages.join(", ")}`,
    project.deployed ? `Deployed: yes, ${project.deployments} production deployments recorded` : "Deployed: no deployment recorded",
    `Activity: ${project.commits} commits by the member across ${project.activeMonths.length} month(s)`,
  ].filter(Boolean).join("\n");
  const ownText = ownWords.map((item) => `${item.title ? `${item.title}\n` : ""}${item.body}`).join("\n\n").slice(0, 20_000);
  const work = [facts, project.readme && `README opening (written in the repository; may be AI-assisted):\n${project.readme}`, ownText && `In the member's own words:\n${ownText}`].filter(Boolean).join("\n\n");
  return { work, ownText };
}

// Communication and first-principles scores must rest on a quote from the member's own words.
export function groundOwnWords(report: BlindReport, ownText: string): BlindReport {
  const own = ownText.toLowerCase().replace(/\s+/g, " ");
  const dimensions = report.dimensions.map((dimension) => OWN_WORDS_CRITERIA.has(dimension.name) && !(dimension.evidence && own.includes(dimension.evidence.toLowerCase().replace(/\s+/g, " ").trim()))
    ? { ...dimension, score: null, evidenceVerified: false, issue: "Not scored: no supporting quote from your own write-up." }
    : dimension);
  const scored = dimensions.filter((dimension) => dimension.score !== null);
  return { ...report, dimensions, overall: scored.length ? Math.round((scored.reduce((sum, dimension) => sum + dimension.score!, 0) / scored.length) * 100) / 10 : null };
}

export async function evaluateProjects(client: SupabaseClient, userId: string, budgetMs: number): Promise<{ evaluated: number; unchanged: number; skipped: number }> {
  const deadline = Date.now() + budgetMs;
  const config = getAIProcessingConfig();
  const [portfolio, contexts, previous] = await Promise.all([
    client.from("portfolio_items").select("source, account, external_id, name, url, data"),
    client.from("project_contexts").select("project_key, kind, title, body"),
    client.from("project_evaluations").select("project_key, input_hash").order("created_at", { ascending: false }),
  ]);
  const done = new Set((previous.data ?? []).map((row) => `${row.project_key}:${row.input_hash}`));
  const projects = summarisePortfolio((portfolio.data ?? []) as PortfolioRow[]).projects;
  const result = { evaluated: 0, unchanged: 0, skipped: 0 };
  for (const project of projects) {
    if (Date.now() > deadline - 60_000) { result.skipped += 1; continue; }
    const mine = ((contexts.data ?? []) as ProjectContext[]).filter((item) => item.project_key === project.key);
    const statement = mine.filter((item) => item.kind === "problem_statement").map((item) => item.body).join("\n\n").slice(0, 6000);
    const ownWords = mine.filter((item) => item.kind === "own_words");
    const standard = projectStandard(Boolean(statement), ownWords.length > 0);
    const { work, ownText } = projectWork(project, ownWords);
    const inputHash = createHash("sha256").update(JSON.stringify({ work, statement, standard, rules: PROJECT_RULES_VERSION, prompt: BLIND_PROMPT_VERSION })).digest("hex");
    if (done.has(`${project.key}:${inputHash}`)) { result.unchanged += 1; continue; }
    try {
      const report = groundOwnWords(await blindEvaluate(work, standard, "project", statement), ownText);
      await client.from("project_evaluations").insert({ user_id: userId, project_key: project.key, input_hash: inputHash, report: { ...report, standardLabel: standard.label, hasStatement: Boolean(statement), hasOwnWords: ownWords.length > 0 }, provider_model: config.model });
      result.evaluated += 1;
    } catch { result.skipped += 1; }
  }
  return result;
}
