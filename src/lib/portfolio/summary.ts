// What self-directed work on GitHub and Vercel shows, computed from collected summaries. Mirrored copies of one
// project across accounts count once. It is ungraded, self-chosen work, and AI coding assistants may have written
// much of the code, so it evidences what was built and shipped (product judgement, AI integration, delivery),
// not hand-coding skill.
export type PortfolioRow = { source: "github" | "vercel"; account: string; external_id: string; name: string; url: string | null; data: Record<string, unknown> };
export type Project = { name: string; accounts: string[]; description: string; languages: string[]; aiPackages: string[]; commits: number; activeMonths: string[]; deployed: boolean; deployments: number; lastActivity: string | null; readme: string; isPublic: boolean };
export type PortfolioSummary = { projects: Project[]; aiProjects: number; providers: string[]; languages: { name: string; projects: number }[]; deployed: number; activeMonths: number; firstActivity: string | null };

const PROVIDER: [RegExp, string][] = [[/anthropic/i, "Anthropic (Claude)"], [/google.*(genai|generative)|^@google\/genai$/i, "Google (Gemini)"], [/^openai$/i, "OpenAI"], [/langchain/i, "LangChain"], [/^@ai-sdk|^ai$/i, "Vercel AI SDK"], [/groq/i, "Groq"], [/whisper|deepgram|assemblyai|elevenlabs/i, "Speech AI"], [/scikit|sklearn|xgboost|prophet|statsmodels/i, "Classical ML"], [/torch|tensorflow|transformers/i, "Deep learning"], [/modelcontextprotocol|^mcp$/i, "MCP"]];
const key = (name: string) => name.toLowerCase().replace(/[-_](\d+|final|v\d+)$/i, "").replace(/[^a-z0-9]/g, "");

export function summarisePortfolio(rows: PortfolioRow[]): PortfolioSummary {
  const projects = new Map<string, Project>();
  const deployedRepos = new Map<string, { deployments: number; last: string | null }>();
  for (const row of rows.filter((item) => item.source === "vercel")) {
    const repo = String(row.data.repo ?? row.name).split("/").pop() ?? row.name;
    deployedRepos.set(key(repo), { deployments: Number(row.data.production ?? row.data.deployments ?? 0), last: (row.data.lastDeployed as string) ?? null });
  }
  for (const row of rows.filter((item) => item.source === "github")) {
    const id = key(row.name);
    const data = row.data;
    const months = Object.keys((data.commitMonths ?? {}) as Record<string, number>);
    const current = projects.get(id);
    const languages = Object.keys((data.languages ?? {}) as Record<string, number>);
    const project: Project = current ?? { name: row.name, accounts: [], description: "", languages: [], aiPackages: [], commits: 0, activeMonths: [], deployed: false, deployments: 0, lastActivity: null, readme: "", isPublic: false };
    project.accounts = [...new Set([...project.accounts, row.account])];
    project.description ||= String(data.description ?? "");
    project.readme ||= String(data.readme ?? "");
    project.languages = [...new Set([...project.languages, ...languages])];
    project.aiPackages = [...new Set([...project.aiPackages, ...((data.aiPackages ?? []) as string[])])];
    project.commits += Number(data.commitsByYou ?? 0);
    project.activeMonths = [...new Set([...project.activeMonths, ...months])].sort();
    project.isPublic ||= data.private === false;
    const pushed = (data.pushedAt as string) ?? null;
    if (pushed && (!project.lastActivity || pushed > project.lastActivity)) project.lastActivity = pushed;
    const deployment = deployedRepos.get(id);
    if (deployment) { project.deployed = true; project.deployments = deployment.deployments; }
    projects.set(id, project);
  }
  const list = [...projects.values()].sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
  const providers = [...new Set(list.flatMap((project) => project.aiPackages.map((name) => PROVIDER.find(([pattern]) => pattern.test(name))?.[1]).filter((name): name is string => Boolean(name))))];
  const languageCounts = new Map<string, number>();
  for (const project of list) for (const language of project.languages) languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  const months = [...new Set(list.flatMap((project) => project.activeMonths))].sort();
  return {
    projects: list, aiProjects: list.filter((project) => project.aiPackages.length || /\b(ai|agent|bot|llm|gpt|gemini|claude)\b/i.test(`${project.name} ${project.description}`)).length,
    providers, languages: [...languageCounts.entries()].map(([name, projects]) => ({ name, projects })).sort((a, b) => b.projects - a.projects).slice(0, 8),
    deployed: list.filter((project) => project.deployed).length, activeMonths: months.length, firstActivity: months[0] ?? null,
  };
}

// Validates an uploaded collector file: shape, sizes and sources only; nothing else is trusted from it.
export function parsePortfolioUpload(raw: unknown): PortfolioRow[] {
  const items = raw && typeof raw === "object" && (raw as { kind?: unknown }).kind === "mesa-portfolio" && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : null;
  if (!items) throw new Error("This is not a portfolio file from the collector.");
  return items.slice(0, 300).flatMap((item) => {
    const row = item as Record<string, unknown>;
    const source = row.source === "github" || row.source === "vercel" ? row.source : null;
    const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
    if (!source || !text(row.external_id, 200) || !text(row.name, 200) || !row.data || typeof row.data !== "object") return [];
    const data = JSON.stringify(row.data).length <= 20_000 ? row.data as Record<string, unknown> : {};
    const url = text(row.url, 500);
    return [{ source, account: text(row.account, 100) || source, external_id: text(row.external_id, 200), name: text(row.name, 200), url: /^https:\/\/github\.com\//.test(url) ? url : null, data }];
  });
}
