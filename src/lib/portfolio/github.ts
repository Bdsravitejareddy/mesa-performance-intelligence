import { createSign } from "node:crypto";
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

// The nightly refresh acts as the app itself: a JWT signed with the app's private key buys a one-hour token for
// one installation, limited to the repositories and read-only permissions the member granted. Nothing is stored.
export function githubAppCanRefresh() {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

function appJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 60, exp: now + 540, iss: process.env.GITHUB_APP_ID })}`;
  const key = (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  return `${body}.${createSign("RSA-SHA256").update(body).sign(key, "base64url")}`;
}

export async function installationToken(installationId: number): Promise<string> {
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, { method: "POST", headers: { authorization: `Bearer ${appJwt()}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }, signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({})) as { token?: string };
  if (!body.token) throw new Error(`GitHub refused the installation token (${response.status}).`);
  return body.token;
}

export async function collectGithub(token: string, deadline: number, installation?: { account: string }): Promise<{ login: string; rows: PortfolioRow[]; installations: { id: number; account: string }[] }> {
  const gh = async (path: string) => {
    const response = await fetch(`https://api.github.com/${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }, signal: AbortSignal.timeout(15_000) });
    return response.ok ? response.json().catch(() => null) : null;
  };
  const file = async (repo: string, path: string) => { const body = await gh(`repos/${repo}/contents/${path}`) as { content?: string } | null; return body?.content ? Buffer.from(body.content, "base64").toString("utf8") : ""; };
  const login = installation?.account ?? ((await gh("user")) as { login?: string } | null)?.login ?? "github";
  // Repositories the member granted the app: across their installations (user token), or one installation's own.
  const installations = installation ? [] : ((await gh("user/installations?per_page=100")) as { installations?: { id: number; account?: { login?: string } }[] } | null)?.installations ?? [];
  const repos: { full_name: string; name: string; private: boolean; fork: boolean; html_url: string; description: string | null; topics?: string[]; homepage: string | null; language: string | null; created_at: string; pushed_at: string; stargazers_count: number }[] = [];
  const pages = installation ? [(page: number) => `installation/repositories?per_page=100&page=${page}`] : installations.map((item) => (page: number) => `user/installations/${item.id}/repositories?per_page=100&page=${page}`);
  for (const path of pages) {
    for (let page = 1; page <= 5; page += 1) {
      const body = await gh(path(page)) as { repositories?: typeof repos } | null;
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
    // One record per account and repository, so each account's own commits are kept and summed, not overwritten.
    rows.push({ source: "github", account: login, external_id: `${login}:${repo.full_name}`, name: repo.name, url: repo.private ? null : repo.html_url, data: {
      private: repo.private, description: repo.description ?? "", topics: repo.topics ?? [], homepage: repo.homepage ?? "", language: repo.language, languages: languages ?? {},
      createdAt: repo.created_at, pushedAt: repo.pushed_at, stars: repo.stargazers_count, aiPackages: [...names].filter((name) => AI_PACKAGES.test(name)), dependencyCount: names.size,
      commitMonths: months.reduce<Record<string, number>>((counts, month) => ({ ...counts, [month]: (counts[month] ?? 0) + 1 }), {}), commitsByYou: months.length,
      readme: readme.replace(/<[^>]+>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 1500),
      deployments: deploys.length, productionDeployments: production.length, lastDeployed: production[0]?.created_at ?? deploys[0]?.created_at ?? null,
    } });
  }
  return { login, rows, installations: installations.map((item) => ({ id: item.id, account: item.account?.login ?? login })) };
}

// Nightly: re-read every connected installation and replace each account's records.
export async function refreshGithub(admin: import("@supabase/supabase-js").SupabaseClient, deadline: number): Promise<{ accounts: number; repos: number; errors: number }> {
  const result = { accounts: 0, repos: 0, errors: 0 };
  if (!githubAppCanRefresh()) return result;
  // Every installation of the app, found with the app's own credentials, so no member needs to reconnect.
  const { data: owner } = await admin.from("sync_runs").select("user_id").order("started_at", { ascending: false }).limit(1).maybeSingle();
  const listed = await fetch("https://api.github.com/app/installations?per_page=100", { headers: { authorization: `Bearer ${appJwt()}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }, signal: AbortSignal.timeout(15_000) }).then((response) => (response.ok ? response.json() : [])).catch(() => []) as { id: number; account?: { login?: string } }[];
  if (owner && Array.isArray(listed) && listed.length) await admin.from("github_installations").upsert(listed.map((item) => ({ installation_id: item.id, user_id: owner.user_id, account: item.account?.login ?? "github" })), { onConflict: "installation_id", ignoreDuplicates: true });
  const { data: installs } = await admin.from("github_installations").select("installation_id, user_id, account");
  for (const install of installs ?? []) {
    if (Date.now() > deadline) break;
    try {
      const { rows } = await collectGithub(await installationToken(Number(install.installation_id)), deadline, { account: install.account as string });
      if (rows.length) {
        await admin.from("portfolio_items").delete().eq("source", "github").eq("account", install.account as string);
        await admin.from("portfolio_items").upsert(rows.map((row) => ({ ...row, user_id: install.user_id, collected_at: new Date().toISOString() })), { onConflict: "source,external_id" });
      }
      await admin.from("github_installations").update({ last_refreshed_at: new Date().toISOString(), last_error: null }).eq("installation_id", install.installation_id);
      result.accounts += 1; result.repos += rows.length;
    } catch (error) {
      result.errors += 1;
      await admin.from("github_installations").update({ last_error: error instanceof Error ? error.message.slice(0, 200) : "Refresh failed." }).eq("installation_id", install.installation_id);
    }
  }
  return result;
}
