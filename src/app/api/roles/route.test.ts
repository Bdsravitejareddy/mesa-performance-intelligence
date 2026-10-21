import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const { from, insert, searchPublicWeb, fetchPublicSource, createSearchProvider, createResearchSession, authUser } = vi.hoisted(() => ({
  from: vi.fn(), insert: vi.fn(), searchPublicWeb: vi.fn(), fetchPublicSource: vi.fn(), createSearchProvider: vi.fn(), createResearchSession: vi.fn(), authUser: { id: "workspace-member" as string | null },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: authUser.id ? { sub: authUser.id } : {} } }) }, from }) }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));
vi.mock("@/lib/public-research/contracts", () => ({ createResearchSession: () => createResearchSession() }));
vi.mock("@/lib/public-research/search-provider", () => ({ createSearchProvider: (...args: unknown[]) => createSearchProvider(...args), searchPublicWeb: (...args: unknown[]) => searchPublicWeb(...args), publicDiscoveryUrl: (value: unknown) => { try { const url = new URL(String(value)); return url.protocol === "https:" ? url.href : null; } catch { return null; } } }));
vi.mock("@/lib/public-research/safe-fetch", () => ({ fetchPublicSource: (...args: unknown[]) => fetchPublicSource(...args) }));

const fetched = { status: "fetched", title: "Senior Product Manager", text: "Required: lead clinical product discovery and healthcare integrations. Preferred: experience with FHIR.", date: "2026-10-01T00:00:00Z", canonicalUrl: "https://careers.example.org/roles/senior-pm", contentHash: "a".repeat(64), retrievedAt: "2026-10-22T10:00:00.000Z", evidence: "fetched-page" };
const verifiableFetched = { ...fetched, title: "Senior Technical Product Manager", text: "Employer: Example Health. Role: Senior Technical Product Manager. Date posted: 2026-10-01. Required: lead clinical product discovery and healthcare integrations.", contentHash: "b".repeat(64) };
function req(body: unknown) { return new NextRequest("https://app.test/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

describe("sourced role benchmarks", () => {
  beforeEach(() => { process.env.PUBLIC_ROLE_SOURCE_HOSTS = "careers.example.org"; });
  afterEach(() => { vi.clearAllMocks(); process.env.PUBLIC_ROLE_SOURCE_HOSTS = "careers.example.org"; authUser.id = "workspace-member"; });
  it("stores only reviewed requirements quoted verbatim from an HTTPS source and owns the profile", async () => {
    const stored: { row: Record<string, unknown> | null } = { row: null };
    insert.mockImplementation((value: Record<string, unknown>) => { stored.row = value; return { select: () => ({ single: async () => ({ data: { id: "role-1" }, error: null }) }) }; });
    from.mockReturnValue({ insert });
    fetchPublicSource.mockResolvedValue(verifiableFetched);
    const response = await POST(req({ action: "save", title: "Senior Technical Product Manager", employer: "Example Health", industry: "Singapore healthtech", sourceUrl: fetched.canonicalUrl, postingDate: "2026-10-01", reviewed: true, reviewedSource: { canonicalUrl: verifiableFetched.canonicalUrl, contentHash: verifiableFetched.contentHash }, requirements: [{ title: "Clinical discovery", description: "Lead clinical product discovery", sourceQuote: "lead clinical product discovery", evidenceKind: "required" }] }));
    expect(response.status).toBe(201);
    expect(stored.row).toEqual(expect.objectContaining({ user_id: "workspace-member", employer: "Example Health", source_url: fetched.canonicalUrl, retrieved_at: fetched.retrievedAt, posting_date: "2026-10-01", is_verified: true }));
    expect((stored.row?.competencies as Array<Record<string, unknown>>)[0]).toEqual(expect.objectContaining({ sourceQuote: "lead clinical product discovery", evidenceKind: "required" }));
  });

  it("saves incomplete profiles as unverified when the posting date or employer is missing", async () => {
    insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "role-2" }, error: null }) }) }); from.mockReturnValue({ insert }); fetchPublicSource.mockResolvedValue(fetched);
    const response = await POST(req({ action: "save", title: "Senior PM", sourceUrl: fetched.canonicalUrl, reviewed: true, reviewedSource: { canonicalUrl: fetched.canonicalUrl, contentHash: fetched.contentHash }, requirements: [{ title: "Clinical discovery", description: "Lead clinical product discovery", sourceQuote: "lead clinical product discovery", evidenceKind: "required" }] }));
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ posting_date: null, employer: "", is_verified: false }));
  });

  it("accepts a manually reviewed profile without a source as an unverified note", async () => {
    insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "role-note" }, error: null }) }) }); from.mockReturnValue({ insert });
    const response = await POST(req({ action: "save", title: "Senior PM", employer: "Example", reviewed: true, requirements: [{ title: "Discovery", description: "Lead discovery", sourceQuote: "", evidenceKind: "responsibility" }] }));
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ source_url: null, retrieved_at: null, posting_date: null, is_verified: false, benchmark_source: "user_supplied_unverified" }));
  });

  it("does not treat generic page metadata dates as proof of the posting date", async () => {
    insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "role-3" }, error: null }) }) }); from.mockReturnValue({ insert }); fetchPublicSource.mockResolvedValue(fetched);
    const response = await POST(req({ action: "save", title: "Senior PM", employer: "Example Health", sourceUrl: fetched.canonicalUrl, postingDate: "2026-10-02", reviewed: true, reviewedSource: { canonicalUrl: fetched.canonicalUrl, contentHash: fetched.contentHash }, requirements: [{ title: "Clinical discovery", description: "Lead clinical product discovery", sourceQuote: "lead clinical product discovery", evidenceKind: "required" }] }));
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ posting_date: "2026-10-02", is_verified: false }));
  });

  it("keeps generic article dates and user-entered employer/title unverified", async () => {
    insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "role-4" }, error: null }) }) }); from.mockReturnValue({ insert }); fetchPublicSource.mockResolvedValue(fetched);
    const response = await POST(req({ action: "save", title: "Senior Technical Product Manager", employer: "Arbitrary Employer", sourceUrl: fetched.canonicalUrl, postingDate: "2026-10-01", reviewed: true, reviewedSource: { canonicalUrl: fetched.canonicalUrl, contentHash: fetched.contentHash }, requirements: [{ title: "Clinical discovery", description: "Lead clinical product discovery", sourceQuote: "lead clinical product discovery", evidenceKind: "required" }] }));
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ is_verified: false, benchmark_source: "user_confirmed_unverified" }));
  });

  it("does not accept a last-updated date as an explicit job posting date", async () => {
    insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "role-5" }, error: null }) }) }); from.mockReturnValue({ insert });
    fetchPublicSource.mockResolvedValue({ ...verifiableFetched, title: "Senior Product Manager", text: "Example Health seeks a Senior Technical Product Manager. Last updated: 2026-10-01. Required: lead clinical product discovery and healthcare integrations." });
    const response = await POST(req({ action: "save", title: "Senior Technical Product Manager", employer: "Example Health", sourceUrl: fetched.canonicalUrl, postingDate: "2026-10-01", reviewed: true, reviewedSource: { canonicalUrl: fetched.canonicalUrl, contentHash: verifiableFetched.contentHash }, requirements: [{ title: "Clinical discovery", description: "Lead clinical product discovery", sourceQuote: "lead clinical product discovery", evidenceKind: "required" }] }));
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ is_verified: false, benchmark_source: "user_confirmed_unverified" }));
  });

  it("rejects saving when the reviewed source content changed before save", async () => {
    fetchPublicSource.mockResolvedValueOnce({ ...verifiableFetched, contentHash: "c".repeat(64) });
    const response = await POST(req({ action: "save", title: "Senior Technical Product Manager", employer: "Example Health", sourceUrl: fetched.canonicalUrl, postingDate: "2026-10-01", reviewed: true, reviewedSource: { canonicalUrl: verifiableFetched.canonicalUrl, contentHash: verifiableFetched.contentHash }, requirements: [{ title: "Clinical discovery", description: "Lead clinical product discovery", sourceQuote: "lead clinical product discovery", evidenceKind: "required" }] }));
    expect(response.status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS source URLs and criteria not present as exact source quotes", async () => {
    expect((await POST(req({ action: "save", title: "Senior PM", sourceUrl: "http://careers.example.org/role", reviewed: true, requirements: [{ title: "X", description: "Y", sourceQuote: "Y", evidenceKind: "required" }] }))).status).toBe(400);
    fetchPublicSource.mockResolvedValue(fetched);
    expect((await POST(req({ action: "save", title: "Senior PM", employer: "Example", sourceUrl: fetched.canonicalUrl, postingDate: "2026-10-01", reviewed: true, requirements: [{ title: "Clinical discovery", description: "Other", sourceQuote: "Other", evidenceKind: "required" }] }))).status).toBe(400);
  });

  it("rejects anonymous profile writes before touching the workspace table", async () => {
    authUser.id = null;
    const response = await POST(req({ action: "save", title: "Senior PM", reviewed: true, requirements: [{ title: "X", description: "Y", sourceQuote: "", evidenceKind: "required" }] }));
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("requires a configured search provider and returns discovery snippets as unverified only", async () => {
    createResearchSession.mockReturnValue({});
    createSearchProvider.mockReturnValue({ readiness: { ready: false, reason: "missing-key" } });
    const unavailable = await POST(req({ action: "discover", roleTitle: "Senior Technical Product Manager", location: "Singapore", industry: "healthcare" }));
    expect(unavailable.status).toBe(503);
    expect(searchPublicWeb).not.toHaveBeenCalled();
    createSearchProvider.mockReturnValue({ readiness: { ready: true } });
    searchPublicWeb.mockResolvedValue([{ title: "Role", url: "https://careers.example.org/roles/1", snippet: "Snippet only", provider: "tavily", date: null, evidence: "discovery-only" }]);
    const response = await POST(req({ action: "discover", roleTitle: "Senior Technical Product Manager", location: "Singapore", industry: "healthcare" }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.results).toEqual([expect.objectContaining({ evidence: "discovery-only", verified: false })]);
    expect(JSON.stringify(result)).not.toContain("competencies");
  });
});
