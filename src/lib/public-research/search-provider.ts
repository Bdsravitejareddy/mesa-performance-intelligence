import "server-only";
import { isIP } from "node:net";
import {
  PublicResearchError,
  type ResearchSession,
  type SearchHit,
  type SearchProvider,
  type SearchProviderName,
  type SearchQuery,
  type SearchReadiness,
} from "./contracts";

const MAX_BYTES = 2 * 1024 * 1024;
const DENIED_DOMAINS = ["linkedin.com", "lnkd.in", "facebook.com", "instagram.com", "twitter.com", "x.com"];

/** Filtering discovery links does not authorize fetching the surviving URLs. */
export function publicDiscoveryUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || isIP(hostname) || hostname.includes(":") || !hostname.includes(".")) return null;
    if (DENIED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return null;
    url.hostname = hostname;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function publicQuery(input: SearchQuery): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PublicResearchError("invalid-public-query");
  const fields = input.kind === "role" ? ["kind", "roleTitle", "location", "organization"]
    : input.kind === "organization" ? ["kind", "organization", "topic"]
      : input.kind === "topic" ? ["kind", "topic"] : [];
  if (!fields.length || Object.keys(input).some((field) => !fields.includes(field))) throw new PublicResearchError("invalid-public-query");
  const values = input.kind === "role" ? [input.roleTitle, input.location, input.organization]
    : input.kind === "organization" ? [input.organization, input.topic] : [input.topic];
  const required = input.kind === "role" ? 2 : 1;
  const clean = values.map((value, index) => {
    if (value === undefined && index >= required) return "";
    if (typeof value !== "string" || value.length > 100 || !/^[\p{L}][\p{L}\p{M}\s&'(),.\-/+]*$/u.test(value.trim()) || /\b(resum[eé]|cv|marks?|grades?|submission|student|confidential|private|password|token|secret|feedback|transcript)\b/i.test(value)) throw new PublicResearchError("invalid-public-query");
    return value.trim().replace(/\s+/g, " ");
  });
  return clean.filter(Boolean).join(" ");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "") || Number(response.headers.get("content-length")) > MAX_BYTES || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("invalid-provider-response");
  }
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) throw new Error("provider-response-too-large");
      chunks.push(part.value);
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

type ProviderOptions = {
  session: ResearchSession;
  /** Server configuration only. Never supply browser-controlled credentials or endpoints. */
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

export function createSearchProvider({ session, env = process.env, fetcher = fetch }: ProviderOptions): SearchProvider {
  const name = env.PUBLIC_SEARCH_PROVIDER;
  const kind: SearchProviderName | null = name === "tavily" || name === "brave" ? name : null;
  const key = kind === "tavily" ? env.TAVILY_API_KEY?.trim() : kind === "brave" ? env.BRAVE_API_KEY?.trim() : undefined;
  const secrets = [env.TAVILY_API_KEY?.trim(), env.BRAVE_API_KEY?.trim()].filter((value): value is string => Boolean(value));
  const redact = (value: unknown, limit: number): string => {
    let text = typeof value === "string" ? value : "";
    for (const secret of secrets) text = text.split(secret).join("[redacted]").split(encodeURIComponent(secret)).join("[redacted]");
    return text.slice(0, limit);
  };
  const readiness: SearchReadiness = !kind ? { ready: false, reason: "provider-not-configured" } : !key ? { ready: false, reason: "missing-key" } : { ready: true };
  return Object.freeze({
    readiness: Object.freeze(readiness),
    async search(query: SearchQuery): Promise<SearchHit[]> {
      if (!readiness.ready || !kind || !key) throw new PublicResearchError(!readiness.ready ? readiness.reason : "missing-key");
      const text = publicQuery(query);
      if (redact(text, 1000) !== text) throw new PublicResearchError("invalid-public-query");
      return session.search(text.toLowerCase(), async () => {
        const url = kind === "tavily" ? "https://api.tavily.com/search" : `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(text)}&count=5`;
        try {
          return await session.request(new URL(url).hostname, async (signal) => {
          const response = await fetcher(url, {
            method: kind === "tavily" ? "POST" : "GET",
            headers: kind === "tavily" ? { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" } : { "x-subscription-token": key, accept: "application/json" },
            ...(kind === "tavily" ? { body: JSON.stringify({ query: text, max_results: 5, search_depth: "basic", include_answer: false, include_raw_content: false, include_published_date: true }) } : {}),
            redirect: "error",
            cache: "no-store",
            signal,
          });
          const payload = record(await boundedJson(response, signal));
          const results = kind === "tavily" ? payload.results : record(payload.web).results;
          if (!Array.isArray(results)) throw new Error("invalid-provider-response");
          const seen = new Set<string>();
          const hits: SearchHit[] = [];
          for (const result of results) {
            const row = record(result);
            const candidate = publicDiscoveryUrl(row.url);
            if (!candidate || redact(candidate, 4096) !== candidate || seen.has(candidate)) continue;
            seen.add(candidate);
            const date = kind === "tavily" ? row.published_date : row.page_age;
            hits.push({ title: redact(row.title, 300), url: candidate, snippet: redact(kind === "tavily" ? row.content : row.description, 1000), provider: kind, date: typeof date === "string" && !Number.isNaN(Date.parse(date)) ? redact(date, 100) : null, evidence: "discovery-only" });
            if (hits.length === 5) break;
          }
          return hits;
          });
        } catch {
          throw new PublicResearchError("search-unavailable");
        }
      });
    },
  });
}

export function searchPublicWeb(query: SearchQuery, provider: SearchProvider): Promise<SearchHit[]> {
  return provider.search(query);
}
