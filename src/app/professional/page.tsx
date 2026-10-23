import { AppShell } from "@/components/app-shell";
import { Why } from "@/components/why";
import { AIConsentGate } from "@/components/ai-consent-gate";
import { ProfessionalEvidenceForm, ProfessionalEvidenceList } from "@/components/professional-evidence";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedRead } from "@/lib/data/cached";
import { PortfolioImport } from "@/components/portfolio-import";
import { summarisePortfolio, type PortfolioRow } from "@/lib/portfolio/summary";

export const dynamic = "force-dynamic";

const GITHUB_MESSAGE: Record<string, string> = {
  imported: "GitHub connected and imported.", not_configured: "GitHub is not set up yet — add the GitHub App settings in Vercel first.",
  invalid: "That GitHub sign-in could not be verified; start again with Connect GitHub.", save_failed: "GitHub was read, but the summary could not be saved.", failed: "GitHub could not be read; try Connect GitHub again.",
};

export default async function ProfessionalEvidencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const github = typeof query.github === "string" ? query.github : null;
  const githubNote = github ? `${GITHUB_MESSAGE[github] ?? ""}${github === "imported" && typeof query.repos === "string" ? ` ${query.repos} repositories read.` : ""}` : "";
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const items = demoMode || !hasSupabaseConfig() ? null : await load();
  const claims = items?.flatMap((item) => item.claims) ?? [];
  const portfolio = items ? summarisePortfolio(await cachedRead("professional:portfolio", loadPortfolio)) : null;
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Professional evidence</div><h1>Resume & portfolio</h1><p className="page-subtitle">A resume line is evidence of a claim, not proof of proficiency. Claims become supported only when another item backs them.</p></div></div>
    {items && <section className="competency-summary" aria-label="Claims"><div className="competency-summary-item"><strong>{items.length}</strong><span>Evidence items</span></div><div className="competency-summary-item"><strong>{claims.filter((claim) => claim.status === "claimed").length}</strong><span>Claims not yet supported</span></div><div className="competency-summary-item"><strong>{claims.filter((claim) => claim.status === "supported" || claim.status === "attested").length}</strong><span>Supported claims{claims.some((claim) => claim.status === "attested") ? ` (${claims.filter((claim) => claim.status === "attested").length} confirmed by you)` : ""}</span></div><div className="competency-summary-item"><strong>{claims.filter((claim) => claim.quantified).length}</strong><span>Quantified claims</span></div></section>}
    {portfolio && <section className="content-panel portfolio-panel" aria-label="Self-directed work">
      <div className="panel-head"><h2>Self-directed work · GitHub & Vercel <span className="panel-count">{portfolio.projects.length}</span></h2><span className="inline-action"><a className="button button-primary" href="/api/github/connect">Connect GitHub</a><PortfolioImport /></span></div>
      {githubNote && <p className="info-callout" role="status">{githubNote}</p>}
      {portfolio.projects.length ? <>
        <div className="stat-strip">
          <div className="stat"><strong>{portfolio.projects.length}</strong><span>Projects (mirrors counted once)</span></div>
          <div className="stat"><strong>{portfolio.aiProjects}</strong><span>Built with AI</span></div>
          <div className="stat"><strong>{portfolio.deployed}</strong><span>Deployed on Vercel</span></div>
          <div className="stat"><strong>{portfolio.activeMonths}</strong><span>Active months{portfolio.firstActivity ? ` since ${portfolio.firstActivity}` : ""}</span></div>
        </div>
        {portfolio.providers.length > 0 && <p className="scope-note"><b>AI you have built with:</b> {portfolio.providers.join(" · ")}. <b>Languages:</b> {portfolio.languages.map((item) => `${item.name} (${item.projects})`).join(", ")}.</p>}
        <div className="portfolio-grid">{portfolio.projects.map((project) => <article key={project.name} className="portfolio-card">
          <header><strong>{project.name}</strong>{project.deployed && <span className="competency-state state-emerging">deployed</span>}</header>
          {project.description && <p>{project.description}</p>}
          <small>{[project.languages.slice(0, 3).join(", "), project.aiPackages.length ? `AI: ${project.aiPackages.slice(0, 3).join(", ")}` : "", project.commits ? `${project.commits} commits` : "", project.lastActivity ? `last ${project.lastActivity.slice(0, 10)}` : ""].filter(Boolean).join(" · ")}</small>
        </article>)}</div>
        <Why label="How to read this">Self-chosen, ungraded work, so it shows what you choose to build when nothing is marked. Coding assistants may have written much of the code, so it evidences what you built and shipped — product judgement, AI integration and delivery — rather than hand-coding skill. Commit counts cover only commits made under each account&apos;s login.</Why>
      </> : <p className="empty-hint">Nothing imported yet.</p>}
      <Why label="How connecting works">Connect GitHub installs a read-only GitHub App on the account you are signed in to, for the repositories you choose, and reads their metadata, languages, dependency names, README openings, your commit months and deployment records (Vercel reports its deployments to the linked repository). The access is used once and not stored. Sign in to your other GitHub account and connect again to add it.</Why>
      <Why label="Or update from a file">Run <code>node scripts/collect-portfolio.mjs ~/Downloads/portfolio.json</code> in this project on your Mac. It reads every GitHub account signed in to the GitHub CLI and the signed-in Vercel CLI account — metadata, languages, dependency names, README openings and commit months, never code or tokens — and writes one file. Upload that file here. Sign in to another account first (<code>gh auth login</code>, <code>vercel login</code>) to include it.</Why>
    </section>}
    <div className="section-stack"><section className="content-panel"><h2>Your evidence</h2>{items ? <ProfessionalEvidenceList items={items} /> : <p className="empty-hint">Connect Supabase to add evidence.</p>}</section>
      <section className="content-panel">{items ? <Why label="Add evidence (CV, portfolio, certificate or link)"><AIConsentGate purpose="Claims are extracted from what you add using Gemini."><ProfessionalEvidenceForm /></AIConsentGate></Why> : null}</section></div>
  </div></AppShell>;
}

async function load() {
  return cachedRead("professional:load", loadWith);
}

async function loadWith(supabase: SupabaseClient) {
  const [evidence, claims, competencies] = await Promise.all([
    supabase.from("professional_evidence").select("id, kind, title, description, url, issued_by, storage_path, created_at").order("created_at", { ascending: false }),
    supabase.from("professional_claims").select("id, evidence_id, claim, claim_type, quantified, competency_id, status, supporting_evidence_id, supporting_note").order("created_at"),
    supabase.from("competencies").select("id, name"),
  ]);
  if (evidence.error || claims.error) throw new Error("Could not load professional evidence. Check that the migration is applied.");
  const competencyName = new Map((competencies.data ?? []).map((row) => [row.id, row.name]));
  const titles = new Map((evidence.data ?? []).map((row) => [row.id, row.title]));
  return (evidence.data ?? []).map((item) => ({
    id: item.id, kind: item.kind, title: item.title, description: item.description, url: item.url, issued_by: item.issued_by, hasFile: Boolean(item.storage_path), created_at: item.created_at,
    claims: (claims.data ?? []).filter((claim) => claim.evidence_id === item.id).map((claim) => ({ id: claim.id, claim: claim.claim, claim_type: claim.claim_type, quantified: claim.quantified, competency: claim.competency_id ? competencyName.get(claim.competency_id) ?? null : null, status: claim.status, supporting: claim.supporting_evidence_id ? titles.get(claim.supporting_evidence_id) ?? null : null, supporting_note: claim.supporting_note })),
  }));
}

async function loadPortfolio(supabase: SupabaseClient): Promise<PortfolioRow[]> {
  const { data } = await supabase.from("portfolio_items").select("source, account, external_id, name, url, data");
  return (data ?? []) as PortfolioRow[];
}
