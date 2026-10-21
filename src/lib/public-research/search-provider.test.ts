import { afterEach, describe, expect, it, vi } from "vitest";
import { createSearchProvider, searchPublicWeb } from "./search-provider";
import { createResearchSession } from "./contracts";

const query = { kind: "role", roleTitle: "Technical Product Manager", location: "Singapore" } as const;
const key = "synthetic-test-secret";
afterEach(() => vi.useRealTimers());
function provider(kind: "tavily" | "brave", payload: unknown, session = createResearchSession()) {
  const fetcher = vi.fn(async () => Response.json(payload));
  return { fetcher, instance: createSearchProvider({ session, env: { PUBLIC_SEARCH_PROVIDER: kind, TAVILY_API_KEY: key, BRAVE_API_KEY: key }, fetcher }) };
}

describe("public search discovery", () => {
  it.each(["tavily", "brave"] as const)("maps %s results without promoting snippets to evidence", async (kind) => {
    const hit = { title: "Public role", url: "https://careers.example.org/role", content: "hint", description: "hint", published_date: "2026-10-01", page_age: "2026-10-01" };
    const p = provider(kind, kind === "tavily" ? { results: [hit], answer: "untrusted answer" } : { web: { results: [hit] } });
    expect(await searchPublicWeb(query, p.instance)).toEqual([{ title: "Public role", url: "https://careers.example.org/role", snippet: "hint", provider: kind, date: "2026-10-01", evidence: "discovery-only" }]);
    const [url, options] = p.fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(kind === "tavily" ? "api.tavily.com/search" : "api.search.brave.com/res/v1/web/search");
    expect(options.redirect).toBe("error");
    expect(JSON.stringify(options)).not.toContain("include_answer\":true");
  });

  it("reports missing configuration without issuing requests or disclosing keys", async () => {
    const p = createSearchProvider({ session: createResearchSession(), env: {} });
    expect(p.readiness).toEqual({ ready: false, reason: "provider-not-configured" });
    await expect(searchPublicWeb(query, p)).rejects.toThrow("provider-not-configured");
    expect(createSearchProvider({ session: createResearchSession(), env: { PUBLIC_SEARCH_PROVIDER: "brave" } }).readiness).toEqual({ ready: false, reason: "missing-key" });
  });

  it("deduplicates concurrent equivalent queries and caps unique queries at eight", async () => {
    vi.useFakeTimers();
    const p = provider("tavily", { results: [] });
    const duplicate = Promise.all([searchPublicWeb(query, p.instance), searchPublicWeb({ ...query, roleTitle: " technical  product manager " }, p.instance)]);
    await vi.runAllTimersAsync();
    await duplicate;
    expect(p.fetcher).toHaveBeenCalledTimes(1);
    for (const topic of ["Strategy", "Marketing", "Analytics", "Leadership", "Operations", "Finance", "Healthcare"]) {
      const pending = searchPublicWeb({ kind: "topic", topic }, p.instance);
      await vi.runAllTimersAsync();
      await pending;
    }
    await expect(searchPublicWeb({ kind: "topic", topic: "Ninth topic" }, p.instance)).rejects.toThrow("query-budget");
    expect(p.fetcher).toHaveBeenCalledTimes(8);
  });

  it("also spaces provider API requests to the same host by one second", async () => {
    vi.useFakeTimers();
    const started: number[] = [];
    const p = createSearchProvider({ session: createResearchSession(), env: { PUBLIC_SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: key }, fetcher: async () => {
      started.push(Date.now());
      return Response.json({ results: [] });
    } });
    const pending = Promise.all([searchPublicWeb({ kind: "topic", topic: "Strategy" }, p), searchPublicWeb({ kind: "topic", topic: "Healthcare" }, p)]);
    await vi.runAllTimersAsync();
    await pending;
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(1000);
  });

  it("filters disallowed domains and duplicate URLs, caps results, and redacts echoed credentials", async () => {
    const p = provider("tavily", { results: [
      { title: "LinkedIn", url: "https://uk.linkedin.com/in/person", content: "private" },
      { title: key, url: "https://example.org/one", content: key },
      { title: "duplicate", url: "https://example.org/one#anchor" },
      { title: "secret URL", url: `https://example.org/${key}` },
      ...Array.from({ length: 8 }, (_, i) => ({ title: `Role ${i}`, url: `https://example.org/role/${i}` })),
    ] });
    const hits = await searchPublicWeb(query, p.instance);
    expect(hits).toHaveLength(5);
    expect(JSON.stringify(hits)).not.toContain(key);
    expect(hits[0].snippet).toBe("[redacted]");
    expect(hits.some((hit) => hit.url.includes("linkedin"))).toBe(false);
  });

  it.each([
    { kind: "topic", topic: "resume: private work history" },
    { kind: "topic", topic: "person@example.org" },
    { ...query, resume: "confidential" },
    { kind: "raw", text: "anything" },
  ])("rejects private and arbitrary query input before transport", async (unsafe) => {
    const p = provider("brave", {});
    await expect(searchPublicWeb(unsafe as never, p.instance)).rejects.toThrow("invalid-public-query");
    expect(p.fetcher).not.toHaveBeenCalled();
  });

  it("does not return upstream errors containing credentials", async () => {
    const p = createSearchProvider({ session: createResearchSession(), env: { PUBLIC_SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: key }, fetcher: async () => { throw new Error(key); } });
    await expect(searchPublicWeb(query, p)).rejects.toThrow(/^search-unavailable$/);
  });

  it("blocks credentials accidentally supplied in an otherwise public query field", async () => {
    const fetcher = vi.fn(async () => Response.json({ results: [] }));
    const p = createSearchProvider({ session: createResearchSession(), env: { PUBLIC_SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: "ExamplePublicKey" }, fetcher });
    await expect(searchPublicWeb({ kind: "topic", topic: "ExamplePublicKey" }, p)).rejects.toThrow("invalid-public-query");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("aborts an eight-second request and bounds even a transport that ignores abort", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    const p = createSearchProvider({ session: createResearchSession(), env: { PUBLIC_SEARCH_PROVIDER: "tavily", TAVILY_API_KEY: key }, fetcher: async (_url, options) => {
      requestSignal = options?.signal;
      return new Promise<Response>(() => undefined);
    } });
    const pending = expect(searchPublicWeb(query, p)).rejects.toThrow("search-unavailable");
    await vi.advanceTimersByTimeAsync(7999);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(requestSignal?.aborted).toBe(true);
  });

  it("shares a thirty-second deadline and starts no searches after it", async () => {
    vi.useFakeTimers();
    const session = createResearchSession();
    const p = provider("tavily", { results: [] }, session);
    await vi.advanceTimersByTimeAsync(30000);
    await expect(searchPublicWeb(query, p.instance)).rejects.toThrow("discovery-deadline");
    expect(p.fetcher).not.toHaveBeenCalled();
  });

  it("rejects oversized and non-JSON provider responses", async () => {
    for (const response of [new Response("x".repeat(2 * 1024 * 1024 + 1), { headers: { "content-type": "application/json" } }), new Response("<html>error</html>")]) {
      const p = createSearchProvider({ session: createResearchSession(), env: { PUBLIC_SEARCH_PROVIDER: "brave", BRAVE_API_KEY: key }, fetcher: async () => response });
      await expect(searchPublicWeb(query, p)).rejects.toThrow("search-unavailable");
    }
  });
});
