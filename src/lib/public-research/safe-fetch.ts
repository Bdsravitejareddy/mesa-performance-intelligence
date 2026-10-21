import "server-only";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { PublicResearchError, type CrawlPolicy, type PublicSource, type ResearchFailure, type ResearchSession } from "./contracts";
import { publicDiscoveryUrl } from "./search-provider";

const MAX_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "MesaintelligenceResearch/1.0 (public career research; robots compliant)";
const CLASSES = new Set(["employer-careers", "organization-team", "government", "conference-speaker", "professional-publication"]);
const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blockedV4.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) blockedV6.addSubnet(address, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, "ipv4");
  // Conservative global-unicast allowlist also excludes mapped/translated IPv4.
  return family === 6 && !address.includes("%") && globalV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
}

type Address = { address: string; family: number };
export type FetchDependencies = {
  resolve: (hostname: string) => Promise<Address[]>;
  request: (url: URL, options: Address & { signal: AbortSignal }) => Promise<Response>;
};

/** No proxy/global fetch/connection pool: DNS pinning is part of the connection. */
export function pinnedHttpsRequest(url: URL, { address, family, signal }: Address & { signal: AbortSignal }): Promise<Response> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const request = https.request(url, {
      method: "GET", agent: false, family,
      lookup: (_hostname, _options, callback) => callback(null, address, family),
      servername: url.hostname, rejectUnauthorized: true, signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html, text/plain", "accept-encoding": "identity" },
    }, (incoming) => {
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = incoming.statusCode ?? 502;
        const noBody = status === 204 || status === 205 || status === 304;
        if (noBody) incoming.resume();
        const body = noBody ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
        resolve(new Response(body, { status, headers }));
      } catch {
        incoming.destroy();
        reject(new PublicResearchError("request-failed"));
      }
    });
    request.once("error", reject);
    request.end();
  });
}

const defaultDependencies: FetchDependencies = {
  resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }),
  request: pinnedHttpsRequest,
};

function permittedUrl(raw: string, policy: CrawlPolicy): URL {
  const normalized = publicDiscoveryUrl(raw);
  if (!normalized) throw new PublicResearchError("unsafe-url");
  const url = new URL(normalized);
  if (!policy.approvedSources.some((source) => source.hostname === url.hostname && CLASSES.has(source.sourceClass))) throw new PublicResearchError("unapproved-source");
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { throw new PublicResearchError("unsafe-url"); }
  if (/\/(?:login|log-in|signin|sign-in|auth|account|admin|api)(?:\/|$)/i.test(path)) throw new PublicResearchError("unsafe-url");
  return url;
}

type DocumentResponse = { status: number; location: string | null; text: string; html: boolean };
type CrawlState = { robots: Map<string, Promise<string>>; documents: Map<string, Promise<DocumentResponse>>; sources: Map<string, Promise<PublicSource>> };
const states = new WeakMap<ResearchSession, CrawlState>();
function stateFor(session: ResearchSession): CrawlState {
  let state = states.get(session);
  if (!state) { state = { robots: new Map(), documents: new Map(), sources: new Map() }; states.set(session, state); }
  return state;
}

function cancel(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) { cancel(response); throw new PublicResearchError("response-too-large"); }
  const encoding = response.headers.get("content-encoding");
  const type = response.headers.get("content-type") ?? "";
  if ((encoding && encoding.toLowerCase() !== "identity") || !/^(?:text\/html|text\/plain)(?:;|$)/i.test(type)) { cancel(response); throw new PublicResearchError("unsupported-content"); }
  if (!response.body) return "";
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
      if (size > MAX_BYTES) throw new PublicResearchError("response-too-large");
      chunks.push(part.value);
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function retrieve(url: URL, policy: CrawlPolicy, dependencies: FetchDependencies): Promise<DocumentResponse> {
  return policy.session.request(url.hostname, async (signal) => {
    const addresses = await dependencies.resolve(url.hostname);
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(({ address, family }) => !isPublicAddress(address) || isIP(address) !== family)) throw new PublicResearchError("unsafe-address");
    const { address, family } = addresses[0];
    const response = await dependencies.request(url, { address, family, signal });
    signal.throwIfAborted();
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      cancel(response);
      return { status: response.status, location: response.headers.get("location"), text: "", html: false };
    }
    if (!response.ok) { cancel(response); return { status: response.status, location: null, text: "", html: false }; }
    return { status: response.status, location: null, text: await boundedText(response, signal), html: /^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "") };
  });
}

function robotsOctets(value: string): string {
  if (/%(?![\da-f]{2})/i.test(value)) throw new PublicResearchError("robots-unavailable");
  return value.replace(/%[\da-f]{2}|[^\x00-\x7f]/giu, (part) => {
    if (part.startsWith("%")) {
      const character = String.fromCharCode(parseInt(part.slice(1), 16));
      return /^[\w.~-]$/.test(character) ? character : part.toUpperCase();
    }
    return encodeURIComponent(part);
  });
}

/** Literal segments avoid attacker-controlled regular-expression backtracking. */
function robotsMatch(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const raw = anchored ? pattern.slice(0, -1) : pattern;
  const parts = raw.split("*");
  if (!path.startsWith(parts[0])) return false;
  let position = parts[0].length;
  for (let index = 1; index < parts.length; index++) {
    const part = parts[index];
    if (anchored && index === parts.length - 1 && part) {
      return path.length - part.length >= position && path.endsWith(part);
    }
    if (!part) continue;
    const found = path.indexOf(part, position);
    if (found < 0) return false;
    position = found + part.length;
  }
  return !anchored || raw.endsWith("*") || position === path.length;
}

/** RFC-style groups and longest match; ambiguous/unsupported directives fail closed. */
function robotsAllow(text: string, url: URL): boolean {
  if (Buffer.byteLength(text) > 512 * 1024) throw new PublicResearchError("robots-unavailable");
  type Rule = { path: string; allow: boolean };
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let group = { agents: [] as string[], rules: [] as Rule[] };
  let hasDirectives = false;
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) throw new PublicResearchError("robots-unavailable");
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!value) throw new PublicResearchError("robots-unavailable");
      if (hasDirectives) { groups.push(group); group = { agents: [], rules: [] }; hasDirectives = false; }
      group.agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      if (!group.agents.length) throw new PublicResearchError("robots-unavailable");
      hasDirectives = true;
      if (value) {
        if (!value.startsWith("/") || value.length > 2048) throw new PublicResearchError("robots-unavailable");
        group.rules.push({ path: robotsOctets(value), allow: key === "allow" });
      }
    } else if (key === "crawl-delay" || key === "request-rate" || key === "visit-time") {
      // Do not silently crawl faster than a site's additional restrictions.
      throw new PublicResearchError("robots-unavailable");
    } else if (key !== "sitemap" && key !== "host") {
      throw new PublicResearchError("robots-unavailable");
    }
  }
  if (group.agents.length) groups.push(group);
  const agent = "mesaintelligenceresearch";
  const specificity = (agents: string[]) => Math.max(-1, ...agents.map((name) => name === "*" ? 0 : agent.includes(name) ? name.length : -1));
  const best = Math.max(-1, ...groups.map(({ agents }) => specificity(agents)));
  const path = robotsOctets(url.pathname + url.search);
  let matchLength = -1;
  let allowed = true;
  for (const selected of groups.filter(({ agents }) => specificity(agents) === best && best >= 0)) {
    for (const rule of selected.rules) {
      if (robotsMatch(rule.path, path)) {
        const length = rule.path.replace(/\*|\$$/g, "").replace(/%[\dA-F]{2}/g, "x").length;
        if (length > matchLength || (length === matchLength && rule.allow)) { matchLength = length; allowed = rule.allow; }
      }
    }
  }
  return allowed;
}

async function checkRobots(url: URL, policy: CrawlPolicy, dependencies: FetchDependencies, state: CrawlState, prefix: string): Promise<void> {
  const key = prefix + url.origin;
  let pending = state.robots.get(key);
  if (!pending) {
    pending = (async () => {
      let robotsUrl = permittedUrl(new URL("/robots.txt", url).href, policy);
      for (let redirects = 0; redirects <= 4; redirects++) {
        const response = await retrieve(robotsUrl, policy, dependencies);
        if (response.location) {
          if (redirects === 4) throw new PublicResearchError("redirect-limit");
          robotsUrl = permittedUrl(new URL(response.location, robotsUrl).href, policy);
          continue;
        }
        if (response.status === 404 || response.status === 410) return "";
        if (response.status < 200 || response.status >= 300) throw new PublicResearchError("robots-unavailable");
        return response.text;
      }
      throw new PublicResearchError("redirect-limit");
    })();
    state.robots.set(key, pending);
  }
  if (!robotsAllow(await pending, url)) throw new PublicResearchError("robots-excluded");
}

function entities(text: string): string {
  return text.replace(/&(?:#(x[\da-f]+|\d+)|(amp|lt|gt|quot|apos|nbsp));/gi, (_match, numeric: string | undefined, named: string | undefined) => {
    if (numeric) {
      const code = numeric[0].toLowerCase() === "x" ? parseInt(numeric.slice(1), 16) : Number(numeric);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : " ";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[named!.toLowerCase()];
  });
}

function pageText(document: string, html: boolean): { title: string; text: string; date: string | null } {
  if (!html) return { title: "", text: document.trim(), date: null };
  // Linear, conservative text extraction. Never render HTML or execute content.
  const lower = document.replace(/[A-Z]/g, (character) => character.toLowerCase());
  const visible: string[] = [];
  const titles: string[] = [];
  let position = 0;
  let inHead = false;
  let inTitle = false;
  let date: string | null = null;
  const append = (text: string) => {
    if (inTitle) titles.push(text);
    else if (!inHead) visible.push(text);
  };
  while (position < document.length) {
    const opening = document.indexOf("<", position);
    if (opening < 0) { append(document.slice(position)); break; }
    append(document.slice(position, opening));
    if (document.startsWith("<!--", opening)) {
      const close = document.indexOf("-->", opening + 4);
      if (close < 0) break;
      position = close + 3;
      continue;
    }
    if (!/[a-z/!?]/i.test(document[opening + 1] ?? "")) { append("<"); position = opening + 1; continue; }
    let end = opening + 1;
    let quote = "";
    for (; end < document.length; end++) {
      const character = document[end];
      if (quote) { if (character === quote) quote = ""; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end >= document.length) break;
    const tag = document.slice(opening, end + 1);
    const name = /^<\/?\s*([a-z][a-z0-9]*)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const closing = tag.startsWith("</");
    position = end + 1;
    if (!closing && ["script", "style", "noscript", "template", "svg"].includes(name)) {
      let close = lower.indexOf(`</${name}`, position);
      while (close >= 0 && !/[\s/>]/.test(lower[close + name.length + 2] ?? "")) close = lower.indexOf(`</${name}`, close + name.length + 2);
      if (close < 0) break;
      position = close;
      continue;
    }
    if (name === "head") inHead = !closing;
    if (name === "title") inTitle = !closing;
    if (name === "meta" && !closing && !date) {
      const metadata = /\b(?:property|name)\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
      const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
      if (metadata && /^(?:article:published_time|date|datePublished)$/i.test(metadata) && content && !Number.isNaN(Date.parse(content))) date = content;
    }
    append(" ");
  }
  return { title: entities(titles.join("")).replace(/\s+/g, " ").trim(), text: entities(visible.join("")).replace(/\s+/g, " ").trim(), date };
}

const unavailable = new Set<ResearchFailure>(["request-failed", "robots-unavailable", "http-unavailable", "empty-source"]);

export async function fetchPublicSource(raw: string, policy: CrawlPolicy, dependencies: FetchDependencies = defaultDependencies): Promise<PublicSource> {
  try {
    const initial = permittedUrl(raw, policy);
    if (Date.now() >= policy.session.deadline) throw new PublicResearchError("discovery-deadline");
    const state = stateFor(policy.session);
    const prefix = JSON.stringify([...policy.approvedSources].sort((a, b) => a.hostname.localeCompare(b.hostname))) + ":";
    const sourceKey = prefix + initial.href;
    const existing = state.sources.get(sourceKey);
    if (existing) return await existing;
    const pending = (async (): Promise<PublicSource> => {
      let url = initial;
      for (let redirects = 0; redirects <= 4; redirects++) {
        policy.session.reservePage(url.href);
        await checkRobots(url, policy, dependencies, state, prefix);
        const key = prefix + url.href;
        let document = state.documents.get(key);
        if (!document) { document = retrieve(url, policy, dependencies); state.documents.set(key, document); }
        const response = await document;
        if (response.location) {
          if (redirects === 4) throw new PublicResearchError("redirect-limit");
          url = permittedUrl(new URL(response.location, url).href, policy);
          continue;
        }
        if (response.status < 200 || response.status >= 300) throw new PublicResearchError("http-unavailable");
        const content = pageText(response.text, response.html);
        if (!content.text) throw new PublicResearchError("empty-source");
        return { status: "fetched", ...content, canonicalUrl: url.href, contentHash: createHash("sha256").update(response.text).digest("hex"), retrievedAt: new Date().toISOString(), evidence: "fetched-page" };
      }
      throw new PublicResearchError("redirect-limit");
    })();
    state.sources.set(sourceKey, pending);
    return await pending;
  } catch (error) {
    const reason = error instanceof PublicResearchError ? error.code : "request-failed";
    return { status: unavailable.has(reason) ? "unavailable" : "blocked", reason };
  }
}
