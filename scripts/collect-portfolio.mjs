#!/usr/bin/env node
// Read-only portfolio collector, run locally by the member. Reads repository metadata, languages, dependency
// manifests, README openings and commit activity from every GitHub account signed in to the GitHub CLI, and
// projects and deployments from the signed-in Vercel CLI account. No source code and no tokens are written:
// tokens stay in this process, and the output is a JSON file of summaries that the member uploads themselves on the
// Resume & portfolio page, where the app stores it under their signed-in session.
// Usage: node scripts/collect-portfolio.mjs <output.json>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const [output] = process.argv.slice(2);
if (!output || !output.endsWith(".json")) { console.error("usage: collect-portfolio.mjs <output.json>"); process.exit(1); }

const AI_PACKAGES = /^(openai|@anthropic-ai\/sdk|anthropic|@google\/genai|@google\/generative-ai|google-generativeai|google-genai|langchain|@langchain\/.+|llama[-_]index|llamaindex|transformers|sentence-transformers|torch|tensorflow|ai|@ai-sdk\/.+|groq|groq-sdk|cohere|mistralai|@mistralai\/.+|ollama|chromadb|pinecone.*|@pinecone-database\/.+|faiss.*|elevenlabs|deepgram.*|@deepgram\/.+|whisper|openai-whisper|assemblyai|twilio|scikit-learn|sklearn|xgboost|prophet|statsmodels|crewai|autogen.*|@modelcontextprotocol\/.+|mcp)$/i;

const accounts = execFileSync("gh", ["auth", "status"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).match(/account (\S+)/g)?.map((line) => line.split(" ")[1]) ?? [];
const gh = async (token, path) => {
  const response = await fetch(`https://api.github.com/${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" } });
  return response.ok ? { body: await response.json().catch(() => null), link: response.headers.get("link") ?? "" } : { body: null, link: "" };
};
const file = async (token, repo, path) => { const { body } = await gh(token, `repos/${repo}/contents/${path}`); return body?.content ? Buffer.from(body.content, "base64").toString("utf8") : ""; };
const dependencies = (pkg, requirements, pyproject) => {
  const names = new Set();
  try { const json = JSON.parse(pkg || "{}"); for (const key of ["dependencies", "devDependencies"]) for (const name of Object.keys(json[key] ?? {})) names.add(name); } catch { /* not JSON */ }
  for (const line of requirements.split(/\n/)) { const name = line.trim().split(/[<>=!~\[;\s]/)[0]; if (name && !name.startsWith("#") && !name.startsWith("-")) names.add(name.toLowerCase()); }
  for (const match of pyproject.matchAll(/^\s*"?([A-Za-z0-9_.-]+)\s*[<>=~"]/gm)) names.add(match[1].toLowerCase());
  return [...names];
};

const items = new Map();
for (const account of accounts) {
  const token = execFileSync("gh", ["auth", "token", "--user", account], { encoding: "utf8" }).trim();
  const login = (await gh(token, "user")).body?.login ?? account;
  for (let page = 1; page <= 5; page += 1) {
    const { body } = await gh(token, `user/repos?per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`);
    if (!Array.isArray(body) || !body.length) break;
    for (const repo of body) {
      if (repo.fork || items.has(`github:${repo.full_name}`)) continue;
      const [languages, readme, pkg, requirements, pyproject, commits] = await Promise.all([
        gh(token, `repos/${repo.full_name}/languages`).then((r) => r.body ?? {}),
        gh(token, `repos/${repo.full_name}/readme`).then((r) => (r.body?.content ? Buffer.from(r.body.content, "base64").toString("utf8") : "")),
        file(token, repo.full_name, "package.json"), file(token, repo.full_name, "requirements.txt"), file(token, repo.full_name, "pyproject.toml"),
        gh(token, `repos/${repo.full_name}/commits?per_page=100&author=${login}`).then((r) => (Array.isArray(r.body) ? r.body.map((commit) => commit.commit?.author?.date?.slice(0, 7)).filter(Boolean) : [])),
      ]);
      const deps = dependencies(pkg, requirements, pyproject);
      items.set(`github:${repo.full_name}`, { source: "github", account: login, external_id: repo.full_name, name: repo.name, url: repo.private ? null : repo.html_url, data: {
        private: repo.private, description: repo.description ?? "", topics: repo.topics ?? [], homepage: repo.homepage ?? "", language: repo.language ?? null, languages,
        createdAt: repo.created_at, pushedAt: repo.pushed_at, stars: repo.stargazers_count, aiPackages: deps.filter((name) => AI_PACKAGES.test(name)), dependencyCount: deps.length,
        commitMonths: commits.reduce((counts, month) => ({ ...counts, [month]: (counts[month] ?? 0) + 1 }), {}), commitsByYou: commits.length,
        readme: readme.replace(/<[^>]+>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 1500),
      } });
    }
  }
}

// Vercel: projects and their deployment counts from the signed-in CLI account.
try {
  const auth = JSON.parse(readFileSync(`${homedir()}/Library/Application Support/com.vercel.cli/auth.json`, "utf8"));
  const vercel = async (path) => (await fetch(`https://api.vercel.com/${path}`, { headers: { authorization: `Bearer ${auth.token}` } })).json().catch(() => ({}));
  const user = (await vercel("v2/user")).user?.username ?? "vercel";
  const teams = [null, ...((await vercel("v2/teams")).teams ?? []).map((team) => team.id)];
  for (const team of teams) {
    const scope = team ? `&teamId=${team}` : "";
    for (const project of (await vercel(`v9/projects?limit=100${scope}`)).projects ?? []) {
      const deployments = (await vercel(`v6/deployments?projectId=${project.id}&limit=100${scope}`)).deployments ?? [];
      items.set(`vercel:${project.id}`, { source: "vercel", account: user, external_id: project.id, name: project.name, url: null, data: {
        framework: project.framework ?? null, repo: project.link?.repo ? `${project.link.org ?? ""}/${project.link.repo}` : null, createdAt: new Date(project.createdAt).toISOString(), updatedAt: new Date(project.updatedAt).toISOString(),
        deployments: deployments.length, production: deployments.filter((deployment) => deployment.target === "production").length, ready: deployments.filter((deployment) => deployment.state === "READY").length,
        lastDeployed: deployments[0] ? new Date(deployments[0].created).toISOString() : null,
      } });
    }
  }
} catch (error) { console.error("Vercel skipped:", error.message); }

writeFileSync(output, JSON.stringify({ kind: "mesa-portfolio", version: 1, collectedAt: new Date().toISOString(), items: [...items.values()] }, null, 1));
console.log(`Collected ${[...items.values()].filter((item) => item.source === "github").length} repositories and ${[...items.values()].filter((item) => item.source === "vercel").length} Vercel projects into ${output}. Upload it on the Resume & portfolio page.`);
