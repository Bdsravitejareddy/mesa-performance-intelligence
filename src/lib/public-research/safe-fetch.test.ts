import { afterEach, describe, expect, it, vi } from "vitest";
import https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { createResearchSession } from "./contracts";
import { fetchPublicSource, isPublicAddress, pinnedHttpsRequest, type FetchDependencies } from "./safe-fetch";

const host = "careers.example.org";
const page = `https://${host}/role`;
const html = "<html><head><title>Public role</title><meta property='article:published_time' content='2026-10-01'></head><body><script>secretScript()</script><h1>Technical Product Manager</h1><p>Lead public product work.</p></body></html>";
function harness(options: { robots?: string; response?: Response; addresses?: string[] } = {}) {
  const session = createResearchSession();
  const request = vi.fn<FetchDependencies["request"]>(async (url: URL) => url.pathname === "/robots.txt"
    ? new Response(options.robots ?? "User-agent: *\nAllow: /", { headers: { "content-type": "text/plain" } })
    : options.response?.clone() ?? new Response(html, { headers: { "content-type": "text/html" } }));
  const dependencies: FetchDependencies = { resolve: async () => (options.addresses ?? ["93.184.216.34"]).map((address) => ({ address, family: address.includes(":") ? 6 : 4 })), request };
  return { policy: { session, approvedSources: [{ hostname: host, sourceClass: "employer-careers" as const }] }, dependencies, request };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("safe public retrieval", () => {
  it("returns fetched text and provenance without script or snippet evidence", async () => {
    const h = harness();
    const result = await fetchPublicSource(page, h.policy, h.dependencies);
    expect(result).toMatchObject({ status: "fetched", title: "Public role", canonicalUrl: page, date: "2026-10-01", evidence: "fetched-page" });
    if (result.status !== "fetched") throw new Error("Expected fetched source");
    expect(result.text).toContain("Lead public product work.");
    expect(result.text).not.toContain("secretScript");
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Number.isNaN(Date.parse(result.retrievedAt))).toBe(false);
    expect(h.request.mock.calls[0][0].pathname).toBe("/robots.txt");
    expect(h.request.mock.calls[1][1]).toMatchObject({ address: "93.184.216.34", family: 4 });
  });

  it.each(["http://careers.example.org/", "https://user:pass@careers.example.org/", "https://careers.example.org:444/", "https://127.0.0.1/", "https://careers.example.org/login", "https://linkedin.com/in/a", "https://uk.linkedin.com/in/a", "https://lnkd.in/a", "https://unapproved.example.org/"])("blocks unsafe or unapproved URL %s before network access", async (url) => {
    const h = harness();
    expect((await fetchPublicSource(url, h.policy, h.dependencies)).status).toBe("blocked");
    expect(h.request).not.toHaveBeenCalled();
  });

  it.each(["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "192.0.0.8", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::", "3fff::1"])("rejects non-public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("allows global IPv4 and IPv6 and rejects mixed public/private DNS answers", async () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    const h = harness({ addresses: ["93.184.216.34", "127.0.0.1"] });
    expect(await fetchPublicSource(page, h.policy, h.dependencies)).toMatchObject({ status: "blocked", reason: "unsafe-address" });
    expect(h.request).not.toHaveBeenCalled();
  });

  it("re-resolves after robots and never connects to a rebound address", async () => {
    const h = harness();
    h.dependencies.resolve = vi.fn().mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    expect(await fetchPublicSource(page, h.policy, h.dependencies)).toMatchObject({ status: "blocked", reason: "unsafe-address" });
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("revalidates redirect URLs and DNS without requesting private targets", async () => {
    for (const target of ["https://127.0.0.1/secret", "https://linkedin.com/in/person", "https://careers.example.org/private"]) {
      const h = harness({ response: new Response(null, { status: 302, headers: { location: target } }) });
      if (target.endsWith("/private")) h.dependencies.resolve = vi.fn().mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]).mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]).mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
      expect((await fetchPublicSource(page, h.policy, h.dependencies)).status).toBe("blocked");
      expect(h.request).toHaveBeenCalledTimes(2);
    }
  });

  it.each([
    "User-agent: *\nDisallow: /role",
    "User-agent: *\nAllow: /\nUser-agent: MesaintelligenceResearch\nDisallow: /role*",
    "User-agent: *\nDisallow: /*?private=",
  ])("obeys robots exclusions %s", async (robots) => {
    const h = harness({ robots });
    expect(await fetchPublicSource(page + "?private=yes", h.policy, h.dependencies)).toMatchObject({ status: "blocked", reason: "robots-excluded" });
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("applies the longest robots rule and allows equal-length Allow", async () => {
    const h = harness({ robots: "User-agent: *\nDisallow: /\nAllow: /role\nDisallow: /role" });
    expect((await fetchPublicSource(page, h.policy, h.dependencies)).status).toBe("fetched");
  });

  it.each([
    ["Disallow: /role", "/%72ole"],
    ["Disallow: /%72ole", "/role"],
    ["Disallow: /rôle", "/r%C3%B4le"],
  ])("normalizes robots rule and URL octets: %s", async (rule, path) => {
    const h = harness({ robots: `User-agent: *\n${rule}` });
    expect(await fetchPublicSource(`https://${host}${path}`, h.policy, h.dependencies)).toMatchObject({ status: "blocked", reason: "robots-excluded" });
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("preserves literal markup in plain-text sources", async () => {
    const h = harness({ response: new Response("Example <script>literal text</script> in a public article", { headers: { "content-type": "text/plain" } }) });
    expect(await fetchPublicSource(page, h.policy, h.dependencies)).toMatchObject({ status: "fetched", text: "Example <script>literal text</script> in a public article" });
  });

  it("does not extract unterminated script content as public page evidence", async () => {
    const h = harness({ response: new Response("<html><script>unclosedScript with private raw contents", { headers: { "content-type": "text/html" } }) });
    expect(await fetchPublicSource(page, h.policy, h.dependencies)).toMatchObject({ status: "unavailable", reason: "empty-source" });
  });

  it("keeps parser positions stable around Unicode case conversion", async () => {
    const h = harness({ response: new Response("<p>İ</p><script>hidden</script><p>visible</p>", { headers: { "content-type": "text/html" } }) });
    expect(await fetchPublicSource(page, h.policy, h.dependencies)).toMatchObject({ status: "fetched", text: "İ visible" });
  });

  it("rejects malformed HTTP status without throwing from the asynchronous response callback", async () => {
    let reply: ((response: IncomingMessage) => void) | undefined;
    const incoming = Object.assign(Readable.from([]), { statusCode: 999, headers: {} });
    vi.spyOn(https, "request").mockImplementation(((_url: URL, _options: https.RequestOptions, onResponse: (response: IncomingMessage) => void) => {
      reply = onResponse;
      return Object.assign(new EventEmitter(), { end: () => undefined });
    }) as unknown as typeof https.request);
    const pending = pinnedHttpsRequest(new URL(page), { address: "93.184.216.34", family: 4, signal: new AbortController().signal });
    expect(() => reply!(incoming as IncomingMessage)).not.toThrow();
    await expect(pending).rejects.toThrow("request-failed");
  });

  it("pins the actual HTTPS lookup and keeps original hostname/certificate verification", async () => {
    let capturedUrl: URL | undefined;
    let capturedOptions: https.RequestOptions | undefined;
    const incoming = Object.assign(Readable.from([Buffer.from("public text")]), { statusCode: 200, headers: { "content-type": "text/plain" } });
    vi.spyOn(https, "request").mockImplementation(((url: URL, options: https.RequestOptions, onResponse: (response: IncomingMessage) => void) => {
      capturedUrl = url;
      capturedOptions = options;
      return Object.assign(new EventEmitter(), { end: () => queueMicrotask(() => onResponse(incoming as IncomingMessage)) });
    }) as typeof https.request);
    const response = await pinnedHttpsRequest(new URL(page), { address: "93.184.216.34", family: 4, signal: new AbortController().signal });
    expect(await response.text()).toBe("public text");
    expect(capturedUrl?.hostname).toBe(host);
    expect(capturedOptions).toMatchObject({ agent: false, family: 4, servername: host, rejectUnauthorized: true, headers: { "accept-encoding": "identity" } });
    const lookupResult = await new Promise((resolve) => capturedOptions!.lookup!(host, { family: 4 }, (error, address, family) => resolve({ error, address, family })));
    expect(lookupResult).toEqual({ error: null, address: "93.184.216.34", family: 4 });
  });

  it.each([
    new Response("{}", { headers: { "content-type": "application/json" } }),
    new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    new Response(html, { headers: { "content-type": "text/html", "content-length": "2097153" } }),
    new Response("x".repeat(2097153), { headers: { "content-type": "text/plain" } }),
  ])("blocks unsupported or oversized responses", async (response) => {
    const h = harness({ response });
    expect((await fetchPublicSource(page, h.policy, h.dependencies)).status).toBe("blocked");
  });

  it("fails closed when robots are unavailable and does not expose upstream errors", async () => {
    const h = harness();
    h.dependencies.request = async () => { throw new Error("sensitive upstream details"); };
    const result = await fetchPublicSource(page, h.policy, h.dependencies);
    expect(result).toEqual({ status: "unavailable", reason: "request-failed" });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("deduplicates pages and counts no more than twelve distinct fetches", async () => {
    vi.useFakeTimers();
    const h = harness();
    const duplicate = Promise.all([fetchPublicSource(page, h.policy, h.dependencies), fetchPublicSource(page + "#fragment", h.policy, h.dependencies)]);
    await vi.runAllTimersAsync();
    expect((await duplicate)[0]).toEqual((await duplicate)[1]);
    const pages = Promise.all(Array.from({ length: 12 }, (_, i) => fetchPublicSource(`https://${host}/page-${i}`, h.policy, h.dependencies)));
    await vi.runAllTimersAsync();
    const results = await pages;
    expect(results.filter((r) => r.status === "fetched")).toHaveLength(11);
    expect(results.at(-1)).toMatchObject({ status: "blocked", reason: "page-budget" });
  });

  it("spaces all same-host requests by at least one second", async () => {
    vi.useFakeTimers();
    const h = harness();
    const started: number[] = [];
    const original = h.dependencies.request;
    h.dependencies.request = async (...args) => { started.push(Date.now()); return original(...args); };
    const pending = Promise.all([fetchPublicSource(page, h.policy, h.dependencies), fetchPublicSource(`https://${host}/second`, h.policy, h.dependencies)]);
    await vi.runAllTimersAsync();
    await pending;
    expect(started).toHaveLength(3);
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(1000);
    expect(started[2] - started[1]).toBeGreaterThanOrEqual(1000);
  });

  it("bounds active requests at three and request lifetime at eight seconds", async () => {
    vi.useFakeTimers();
    const h = harness();
    let active = 0;
    let peak = 0;
    h.dependencies.request = async (_url, options) => {
      active++; peak = Math.max(peak, active);
      return new Promise<Response>((_resolve, reject) => options.signal.addEventListener("abort", () => { active--; reject(new Error("timeout")); }, { once: true }));
    };
    const hosts = ["one.example.org", "two.example.org", "three.example.org", "four.example.org"];
    const policy = { ...h.policy, approvedSources: hosts.map((hostname) => ({ hostname, sourceClass: "employer-careers" as const })) };
    const pending = Promise.all(hosts.map((hostname) => fetchPublicSource(`https://${hostname}/role`, policy, h.dependencies)));
    await vi.advanceTimersByTimeAsync(7999);
    expect(active).toBe(3);
    await vi.runAllTimersAsync();
    expect(peak).toBe(3);
    expect((await pending).every((result) => result.status === "unavailable")).toBe(true);
  });

  it("shares the thirty-second discovery deadline even across later calls", async () => {
    vi.useFakeTimers();
    const h = harness();
    await vi.advanceTimersByTimeAsync(30001);
    expect(await fetchPublicSource(page, h.policy, h.dependencies)).toMatchObject({ status: "blocked", reason: "discovery-deadline" });
    expect(h.request).not.toHaveBeenCalled();
  });
});
