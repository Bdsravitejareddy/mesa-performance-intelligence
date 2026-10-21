import "server-only";

/** These fields describe public research subjects, never private student context. */
export type SearchQuery =
  | { kind: "role"; roleTitle: string; location: string; organization?: string }
  | { kind: "organization"; organization: string; topic?: string }
  | { kind: "topic"; topic: string };

export type SearchProviderName = "tavily" | "brave";
export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  provider: SearchProviderName;
  /** Provider-reported date; it has not been verified against the page. */
  date: string | null;
  evidence: "discovery-only";
};

export type SearchReadiness =
  | { ready: true }
  | { ready: false; reason: "provider-not-configured" | "missing-key" };

export interface SearchProvider {
  readonly readiness: SearchReadiness;
  search(query: SearchQuery): Promise<SearchHit[]>;
}

export type ResearchFailure = "invalid-public-query" | "provider-not-configured" | "missing-key" | "query-budget" | "page-budget" | "discovery-deadline" | "search-unavailable" | "request-failed" | "unsafe-url" | "unapproved-source" | "unsafe-address" | "robots-excluded" | "robots-unavailable" | "unsupported-content" | "response-too-large" | "redirect-limit" | "http-unavailable" | "empty-source";

export class PublicResearchError extends Error {
  constructor(public readonly code: ResearchFailure) {
    super(code);
    this.name = "PublicResearchError";
  }
}

type StartTransport = <T>(operation: () => Promise<T>) => Promise<T>;

/** One instance per user-initiated discovery, shared across all its searches. */
export class ResearchSession {
  readonly deadline = Date.now() + 30_000;
  private readonly queries = new Map<string, Promise<SearchHit[]>>();
  private readonly pages = new Set<string>();
  private activeRequests = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly nextHostStart = new Map<string, number>();
  private readonly hostTurns = new Map<string, Promise<void>>();

  reservePage(url: string): void {
    if (Date.now() >= this.deadline) throw new PublicResearchError("discovery-deadline");
    if (this.pages.has(url)) return;
    if (this.pages.size >= 12) throw new PublicResearchError("page-budget");
    this.pages.add(url);
  }

  private async acquire(): Promise<void> {
    if (Date.now() >= this.deadline) throw new PublicResearchError("discovery-deadline");
    if (this.activeRequests < 3) { this.activeRequests++; return; }
    await new Promise<void>((resolve, reject) => {
      const ready = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = this.waiting.indexOf(ready);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(new PublicResearchError("discovery-deadline"));
      }, Math.max(0, this.deadline - Date.now()));
      this.waiting.push(ready);
    });
  }

  private startTransport<T>(hostname: string, signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    const previous = this.hostTurns.get(hostname) ?? Promise.resolve();
    const pending = previous.then(async () => {
      for (;;) {
        signal.throwIfAborted();
        if (Date.now() >= this.deadline) throw new PublicResearchError("discovery-deadline");
        const wait = (this.nextHostStart.get(hostname) ?? 0) - Date.now();
        if (wait <= 0) {
          // Record and invoke together after DNS, in FIFO order. Wrapping the
          // transport promise releases the host turn at start, not at body finish.
          this.nextHostStart.set(hostname, Date.now() + 1000);
          return { transport: operation() };
        }
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            reject(new PublicResearchError("request-failed"));
          };
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
          }, wait);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        });
      }
    });
    this.hostTurns.set(hostname, pending.then(() => undefined, () => undefined));
    return pending.then(({ transport }) => transport);
  }

  /** Includes DNS, transport-start throttling, and full body consumption.
   * Callers validate DNS first and invoke HTTP only through startTransport.
   */
  async request<T>(hostname: string, operation: (signal: AbortSignal, startTransport: StartTransport) => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const remaining = Math.min(8000, this.deadline - Date.now());
      if (remaining <= 0) throw new PublicResearchError("discovery-deadline");
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new PublicResearchError("request-failed")); }, remaining);
      });
      try {
        return await Promise.race([
          operation(controller.signal, (start) => this.startTransport(hostname, controller.signal, start)),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    } finally {
      const ready = this.waiting.shift();
      if (ready) ready();
      else this.activeRequests--;
    }
  }

  search(key: string, operation: () => Promise<SearchHit[]>): Promise<SearchHit[]> {
    if (Date.now() >= this.deadline) return Promise.reject(new PublicResearchError("discovery-deadline"));
    const existing = this.queries.get(key);
    if (existing) return existing;
    if (this.queries.size >= 8) return Promise.reject(new PublicResearchError("query-budget"));
    // Reserve synchronously before starting work so concurrent calls share the budget.
    const pending = Promise.resolve().then(operation);
    this.queries.set(key, pending);
    return pending;
  }
}

export function createResearchSession(): ResearchSession {
  return new ResearchSession();
}

/** Fetched pages and discovery snippets are distinct evidence types. */
export type PublicSource =
  | { status: "fetched"; title: string; text: string; date: string | null; canonicalUrl: string; contentHash: string; retrievedAt: string; evidence: "fetched-page" }
  | { status: "blocked"; reason: ResearchFailure }
  | { status: "unavailable"; reason: ResearchFailure };

export type ApprovedSourceClass = "employer-careers" | "organization-team" | "government" | "conference-speaker" | "professional-publication";
export type CrawlPolicy = {
  session: ResearchSession;
  /** Exact hostnames only, approved after terms and source-class review. */
  approvedSources: ReadonlyArray<{ hostname: string; sourceClass: ApprovedSourceClass }>;
};
