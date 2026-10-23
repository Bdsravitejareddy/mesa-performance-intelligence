import type { SupabaseClient } from "@supabase/supabase-js";
import { AppShell } from "@/components/app-shell";
import { Why } from "@/components/why";
import { DeleteContext, ProjectContextForm } from "@/components/project-context-form";
import { RefreshEverything } from "@/components/refresh-everything";
import { cachedRead } from "@/lib/data/cached";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { summarisePortfolio, type PortfolioRow } from "@/lib/portfolio/summary";
import type { BlindReport } from "@/lib/quality/engine";

export const dynamic = "force-dynamic";

type Context = { id: string; project_key: string; kind: "problem_statement" | "own_words"; title: string; body: string; file_name: string | null; created_at: string };
type Evaluation = { project_key: string; report: BlindReport & { standardLabel?: string; hasStatement?: boolean; hasOwnWords?: boolean }; created_at: string };
const fmt = (value: number | null | undefined) => (value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1));

export default async function ProjectsPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const data = demoMode || !hasSupabaseConfig() ? null : await cachedRead("projects:load", load);
  const projects = data ? summarisePortfolio(data.rows).projects : [];
  const evaluated = projects.filter((project) => data?.evaluations.has(project.key)).length;
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Self-directed work</div><h1>Projects</h1><p className="page-subtitle">{projects.length ? `${projects.length} projects from GitHub · ${evaluated} evaluated. Add the problem you were given, or explain the work in your own words, to ground the evaluation.` : "Connect GitHub on Resume & portfolio to bring your projects in."}</p></div>{data && <RefreshEverything />}</div>
    <p className="info-callout"><span><b>How projects are judged.</b> Each project is graded blind against fixed project criteria — and, when you add one, against the problem statement you were given. The evidence is the project&apos;s facts, its README and anything you write in your own words; only your own words can support communication or first-principles reasoning. They are academic case studies, so deployment and real-world use are never assessed. Projects are ungraded and may be AI-assisted, so they are weighted as self-directed work, below exams and graded assignments.</span></p>
    <div className="project-list">{projects.map((project) => {
      const evaluation = data!.evaluations.get(project.key);
      const contexts = data!.contexts.filter((item) => item.project_key === project.key);
      return <article key={project.key} className="content-panel project-card">
        <header className="panel-head"><div><h2>{project.name}</h2><small>{[project.languages.slice(0, 3).join(", "), project.aiPackages.length ? `AI: ${project.aiPackages.slice(0, 3).join(", ")}` : "", project.commits ? `${project.commits} matched commits` : "commits not matched to your login"].filter(Boolean).join(" · ")}</small></div>{evaluation && <span className="project-score"><b>{fmt(evaluation.report.overall)}</b><small>/100 blind</small></span>}</header>
        {project.description && <p>{project.description}</p>}
        {evaluation ? <>
          <p className="grade-insight">{evaluation.report.summary}</p>
          <Why label="Criteria and evidence"><p className="scope-note">{evaluation.report.standardLabel}. Graded {new Date(evaluation.created_at).toLocaleDateString()}.</p><table className="criteria-table"><thead><tr><th>Criterion</th><th>Score /10</th><th>Evidence</th></tr></thead><tbody>{evaluation.report.dimensions.map((dimension) => <tr key={dimension.name}><td>{dimension.name}{dimension.issue && <small>{dimension.issue}</small>}</td><td>{fmt(dimension.score)}</td><td>{dimension.evidence && dimension.evidenceVerified ? <q>{dimension.evidence}</q> : <small>no verified quote</small>}</td></tr>)}</tbody></table></Why>
        </> : <p className="empty-hint">Not evaluated yet — it runs in the next refresh.</p>}
        {contexts.length > 0 && <ul className="project-contexts">{contexts.map((item) => <li key={item.id}><span className={`competency-state ${item.kind === "own_words" ? "state-emerging" : ""}`}>{item.kind === "own_words" ? "your words" : "given problem"}</span><strong>{item.title || item.file_name || (item.kind === "own_words" ? "Write-up" : "Problem statement")}</strong><small>{item.body.slice(0, 140)}{item.body.length > 140 ? "…" : ""}</small><DeleteContext id={item.id} /></li>)}</ul>}
        <Why label="Add context"><ProjectContextForm projectKey={project.key} /></Why>
      </article>;
    })}</div>
  </div></AppShell>;
}

async function load(supabase: SupabaseClient) {
  const [rows, contexts, evaluations] = await Promise.all([
    supabase.from("portfolio_items").select("source, account, external_id, name, url, data"),
    supabase.from("project_contexts").select("id, project_key, kind, title, body, file_name, created_at").order("created_at", { ascending: false }),
    supabase.from("project_evaluations").select("project_key, report, created_at").order("created_at", { ascending: false }),
  ]);
  const latest = new Map<string, Evaluation>();
  for (const row of (evaluations.data ?? []) as Evaluation[]) if (!latest.has(row.project_key)) latest.set(row.project_key, row);
  return { rows: (rows.data ?? []) as PortfolioRow[], contexts: (contexts.data ?? []) as Context[], evaluations: latest };
}
