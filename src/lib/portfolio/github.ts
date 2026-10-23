import type { PortfolioRow } from "./summary";

// Read-only collection through a GitHub App user token: repository metadata, languages, dependency names,
// README openings, the member's commit months and deployment records (Vercel reports its deployments to the
// linked repository). The token is used for this one collection and never stored.
const AI_PACKAGES = /^(openai|@anthropic-ai\/sdk|anthropic|@google\/genai|@google\/generative-ai|google-generativeai|google-genai|langchain|@langchain\/.+|llama[-_]index|llamaindex|transformers|sentence-transformers|torch|tensorflow|ai|@ai-sdk\/.+|groq|groq-sdk|cohere|mistralai|@mistralai\/.+|ollama|chromadb|pinecone.*|@pinecone-database\/.+|faiss.*|elevenlabs|deepgram.*|@deepgram\/.+|whisper|openai-whisper|assemblyai|scikit-learn|sklearn|xgboost|prophet|statsmodels|crewai|autogen.*|@modelcontextprotocol\/.+|mcp)$/i;

export function githubAppConfig() {
  const clientId = process.env.GITHUB_APP_CLIENT_ID ?? "";
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET ?? "";
  const slug = process.env.GITHUB_APP_SLUG ?? "";
  const base = process.env.APP_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  let origin = "";
  try { const url = new URL(base); if (url.protocol === "https:") origin = url.origin; } catch { origin = ""; }
  return { configured: Boolean(clientId && clientSecret && slug && origin), clientId, clientSecret, slug, callback: `${origin}/api/github/callback` };
}

export async function exchangeCode(code: string): Promise<string> {
  const config = githubAppConfig();
  const response = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.callback }), signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({})) as { access_token?: string };
  if (!body.access_token) throw new Error("GitHub did not grant access.");
  return body.access_token;
}

export async function collectGithub(token: string, deadline: number): Promise<{ login: string; rows: PortfolioRow[] }> {
  const gh = async (path: string) => {
    const response = await fetch(`https://api.github.com/${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }, signal: AbortSignal.timeout(15_000) });
    return response.ok ? response.json().catch(() => null) : null;
  };
  const file = async (repo: string, path: string) => { const body = await gh(`repos/${repo}/contents/${path}`) as { content?: string } | null; return body?.content ? Buffer.from(body.content, "base64").toString("utf8") : ""; };
  const login = ((await gh("user")) as { login?: string } | null)?.login ?? "github";
  // Repositories the member granted the app, across their installations.
  const installations = ((await gh("user/installations?per_page=100")) as { installations?: { id: number }[] } | null)?.installations ?? [];
  const repos: { full_name: string; name: string; private: boolean; fork: boolean; html_url: string; description: string | null; topics?: string[]; homepage: string | null; language: string | null; created_at: string; pushed_at: string; stargazers_count: number }[] = [];
  for (const installation of installations) {
    for (let page = 1; page <= 5; page += 1) {
      const body = await gh(`user/installations/${installation.id}/repositories?per_page=100&page=${page}`) as { repositories?: typeof repos } | null;
      if (!body?.repositories?.length) break;
      repos.push(...body.repositories);
    }
  }
  const rows: PortfolioRow[] = [];
  for (const repo of repos.filter((item, index, all) => !item.fork && all.findIndex((other) => other.full_name === item.full_name) === index)) {
    if (Date.now() > deadline) break;
    const [languages, readme, pkg, requirements, pyproject, commits, deployments] = await Promise.all([
      gh(`repos/${repo.full_name}/languages`),
      gh(`repos/${repo.full_name}/readme`).then((body) => ((body as { content?: string } | null)?.content ? Buffer.from((body as { content: string }).content, "base64").toString("utf8") : "")),
      file(repo.full_name, "package.json"), file(repo.full_name, "requirements.txt"), file(repo.full_name, "pyproject.toml"),
      gh(`repos/${repo.full_name}/commits?per_page=100&author=${login}`),
      gh(`repos/${repo.full_name}/deployments?per_page=100`),
    ]);
    const names = new Set<string>();
    try { const json = JSON.parse(pkg || "{}") as Record<string, Record<string, string>>; for (const key of ["dependencies", "devDependencies"]) for (const name of Object.keys(json[key] ?? {})) names.add(name); } catch { /* not JSON */ }
    for (const line of requirements.split(/\n/)) { const name = line.trim().split(/[<>=!~[;\s]/)[0]; if (name && !name.startsWith("#") && !name.startsWith("-")) names.add(name.toLowerCase()); }
    for (const match of pyproject.matchAll(/^\s*"?([A-Za-z0-9_.-]+)\s*[<>=~"]/gm)) names.add(match[1].toLowerCase());
    const months = (Array.isArray(commits) ? commits as { commit?: { author?: { date?: string } } }[] : []).map((commit) => commit.commit?.author?.date?.slice(0, 7)).filter((month): month is string => Boolean(month));
    const deploys = Array.isArray(deployments) ? deployments as { environment?: string; created_at?: string }[] : [];
    const production = deploys.filter((deployment) => /production/i.test(deployment.environment ?? ""));
    rows.push({ source: "github", account: login, external_id: repo.full_name, name: repo.name, url: repo.private ? null : repo.html_url, data: {
      private: repo.private, description: repo.description ?? "", topics: repo.topics ?? [], homepage: repo.homepage ?? "", language: repo.language, languages: languages ?? {},
      createdAt: repo.created_at, pushedAt: repo.pushed_at, stars: repo.stargazers_count, aiPackages: [...names].filter((name) => AI_PACKAGES.test(name)), dependencyCount: names.size,
      commitMonths: months.reduce<Record<string, number>>((counts, month) => ({ ...counts, [month]: (counts[month] ?? 0) + 1 }), {}), commitsByYou: months.length,
      readme: readme.replace(/<[^>]+>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 1500),
      deployments: deploys.length, productionDeployments: production.length, lastDeployed: production[0]?.created_at ?? deploys[0]?.created_at ?? null,
    } });
  }
  return { login, rows };
}
