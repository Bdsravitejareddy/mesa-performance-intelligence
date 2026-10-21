import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createResearchSession } from "@/lib/public-research/contracts";
import { fetchPublicSource } from "@/lib/public-research/safe-fetch";
import { createSearchProvider, publicDiscoveryUrl, searchPublicWeb } from "@/lib/public-research/search-provider";

type Requirement = { title: string; description: string; sourceQuote: string; evidenceKind: "responsibility" | "required" | "preferred" };
function approvedHosts(): string[] {
  return (process.env.PUBLIC_ROLE_SOURCE_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase().replace(/\.$/, "")).filter((host) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) && !host.includes(".."));
}

function isoDate(value: unknown): string | null | false {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : false;
}

function parseRequirements(value: unknown): Requirement[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) return null;
  const requirements: Requirement[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const description = typeof row.description === "string" ? row.description.trim() : "";
    const sourceQuote = typeof row.sourceQuote === "string" ? row.sourceQuote.trim() : "";
    const evidenceKind = row.evidenceKind;
    if (!title || title.length > 160 || description.length > 1000 || sourceQuote.length > 1200 || !["responsibility", "required", "preferred"].includes(String(evidenceKind))) return null;
    requirements.push({ title, description, sourceQuote, evidenceKind: evidenceKind as Requirement["evidenceKind"] });
  }
  return requirements;
}

function normalizedText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function hasLabeledValue(sourceText: string, labels: readonly string[], value: string): boolean {
  return sourceText.split(/[\r\n.!?;|]+/).some((segment) => {
    return labels.some((label) => {
      const labelPattern = label.replace(/\s+/g, "\\s+");
      const match = new RegExp(`^\\s*${labelPattern}\\s*(?::|-|\\s)\\s*(.*?)\\s*$`, "i").exec(segment);
      return Boolean(match && normalizedText(match[1]) === normalizedText(value));
    });
  });
}

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase to manage private role profiles." }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid role request." }, { status: 400 });
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in to manage private role profiles." }, { status: 401 });

  if (body.action === "discover") {
    const roleTitle = typeof body.roleTitle === "string" ? body.roleTitle.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    if (!roleTitle || !location || roleTitle.length > 100 || location.length > 100 || typeof body.organization === "string" && body.organization.length > 100) return NextResponse.json({ error: "Enter a public role title and location." }, { status: 400 });
    const session = createResearchSession();
    const provider = createSearchProvider({ session });
    if (!provider.readiness.ready) return NextResponse.json({ error: "Public role discovery is unavailable until a server-side search provider is configured." }, { status: 503 });
    try {
      const hits = await searchPublicWeb({ kind: "role", roleTitle, location, ...(typeof body.organization === "string" && body.organization.trim() ? { organization: body.organization.trim() } : {}) }, provider);
      const hosts = approvedHosts();
      return NextResponse.json({ results: hits.filter((hit) => {
        const safe = publicDiscoveryUrl(hit.url);
        return safe && hosts.includes(new URL(safe).hostname);
      }).map((hit) => ({ title: hit.title, url: hit.url, snippet: hit.snippet, provider: hit.provider, reportedDate: hit.date, evidence: "discovery-only", verified: false })) });
    } catch {
      return NextResponse.json({ error: "Public role search could not be completed." }, { status: 502 });
    }
  }

  const action = body.action;
  const rawUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  const sourceUrl = rawUrl ? publicDiscoveryUrl(rawUrl) : null;
  if (rawUrl && !sourceUrl) return NextResponse.json({ error: "Role source must be a valid public HTTPS URL." }, { status: 400 });
  const hosts = approvedHosts();
  const host = sourceUrl ? new URL(sourceUrl).hostname : "";
  const permitted = Boolean(sourceUrl && hosts.includes(host));

  if (action === "fetch") {
    if (!sourceUrl || !permitted) return NextResponse.json({ error: "This source host is not approved for automated retrieval. Open it yourself and enter its requirements for an unverified profile." }, { status: 400 });
    const source = await fetchPublicSource(sourceUrl, { session: createResearchSession(), approvedSources: [{ hostname: host, sourceClass: "employer-careers" }] });
    if (source.status !== "fetched") return NextResponse.json({ error: "The public source could not be retrieved under the configured access and robots rules." }, { status: 422 });
    return NextResponse.json({ source: { title: source.title, text: source.text, canonicalUrl: source.canonicalUrl, pageDate: source.date, retrievedAt: source.retrievedAt, contentHash: source.contentHash, verified: false } });
  }

  if (action !== "save") return NextResponse.json({ error: "Choose discovery, fetch, or save." }, { status: 400 });
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const employer = typeof body.employer === "string" ? body.employer.trim().slice(0, 160) : "";
  const industry = typeof body.industry === "string" ? body.industry.trim().slice(0, 120) : "";
  const postingDate = isoDate(body.postingDate);
  const requirements = parseRequirements(body.requirements);
  if (!title || title.length > 160 || postingDate === false || !requirements || body.reviewed !== true) return NextResponse.json({ error: "Review the role source, enter a valid posting date if known, and add at least one valid requirement." }, { status: 400 });

  let verified = false;
  let retrievedAt: string | null = null;
  let savedUrl: string | null = sourceUrl;
  let sourceHash: string | null = null;
  let finalRequirements = requirements;
  if (sourceUrl && permitted) {
    const review = body.reviewedSource && typeof body.reviewedSource === "object" && !Array.isArray(body.reviewedSource) ? body.reviewedSource as Record<string, unknown> : null;
    const reviewedCanonicalUrl = typeof review?.canonicalUrl === "string" ? publicDiscoveryUrl(review.canonicalUrl) : null;
    const reviewedContentHash = typeof review?.contentHash === "string" && /^[\da-f]{64}$/i.test(review.contentHash) ? review.contentHash.toLowerCase() : null;
    if (!reviewedCanonicalUrl || reviewedCanonicalUrl !== sourceUrl || !reviewedContentHash) return NextResponse.json({ error: "Review the fetched source before saving this benchmark." }, { status: 400 });
    const source = await fetchPublicSource(sourceUrl, { session: createResearchSession(), approvedSources: [{ hostname: host, sourceClass: "employer-careers" }] });
    if (source.status !== "fetched") return NextResponse.json({ error: "The reviewed source is no longer retrievable; the benchmark was not saved as verified." }, { status: 422 });
    if (source.canonicalUrl !== reviewedCanonicalUrl || source.contentHash.toLowerCase() !== reviewedContentHash) return NextResponse.json({ error: "The role source changed since review. Reopen and review the updated page before saving." }, { status: 409 });
    if (requirements.some((requirement) => !requirement.sourceQuote || !source.text.includes(requirement.sourceQuote))) return NextResponse.json({ error: "Each verified requirement must include an exact quote from the fetched role source." }, { status: 400 });
    savedUrl = source.canonicalUrl;
    retrievedAt = source.retrievedAt;
    sourceHash = source.contentHash;
    finalRequirements = requirements.map((item) => ({ ...item, sourceUrl: source.canonicalUrl, retrievedAt: source.retrievedAt } as Requirement & { sourceUrl: string; retrievedAt: string }));
    const confirmsTitle = normalizedText(source.title) === normalizedText(title) || hasLabeledValue(source.text, ["role", "job title", "position"], title);
    const confirmsEmployer = Boolean(employer && hasLabeledValue(source.text, ["employer", "company", "hiring organization"], employer));
    // Article/page metadata dates describe the page, not necessarily the job posting.
    const confirmsPostingDate = Boolean(postingDate && hasLabeledValue(source.text, ["date posted", "posted on", "job posted"], postingDate));
    verified = Boolean(confirmsTitle && confirmsEmployer && confirmsPostingDate);
  } else {
    // User-entered details and links remain useful as private notes, but do not become verified benchmarks.
    finalRequirements = requirements.map((item) => ({ ...item, sourceQuote: "" }));
  }

  const { data, error } = await supabase.from("role_profiles").insert({
    user_id: userId,
    title,
    industry,
    employer,
    benchmark_source: verified ? "fetched_public_role" : sourceUrl && permitted ? "user_confirmed_unverified" : "user_supplied_unverified",
    source_url: savedUrl,
    retrieved_at: retrievedAt,
    posting_date: postingDate,
    is_verified: verified,
    source_content_hash: sourceHash,
    competencies: finalRequirements,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not save this private role profile." }, { status: 400 });
  return NextResponse.json({ id: data.id, verified }, { status: 201 });
}

