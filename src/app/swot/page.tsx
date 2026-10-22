import { createHash } from "node:crypto";
import { AppShell } from "@/components/app-shell";
import { SwotForm } from "@/components/swot-form";
import { loadCompetencyInputs } from "@/lib/competency/load";
import { buildCompetencyMap } from "@/lib/competency/map";
import { hiddenCriterionGaps, parseCriterionScores } from "@/lib/feedback/criteria";
import { buildEvidenceSwot, compareSwot, type SwotCategory, type SwotItem } from "@/lib/insights/swot-evidence";
import { describeSyncHealth, type SyncRun } from "@/lib/lms/sync-health";
import { buildLibrary } from "@/lib/roles/library";
import { roleReadiness } from "@/lib/roles/readiness";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedRead } from "@/lib/data/cached";

export const dynamic = "force-dynamic";
const QUADRANTS: [SwotCategory, string, string][] = [
  ["strength", "Strengths", "Demonstrated competencies and supported claims"],
  ["weakness", "Weaknesses", "Shortfalls your results actually show — never missing evidence"],
  ["opportunity", "Opportunities", "Evidence to build, emerging strengths and transferable roles"],
  ["threat", "Threats", "Target-role gaps, eligibility thresholds and data risks"],
];
const BASIS = { confirmed: "Confirmed", possibility: "Possibility", context: "Context" } as const;

export default async function SwotPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const data = demoMode || !hasSupabaseConfig() ? null : await load();
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Evidence-backed SWOT</div><h1>SWOT analysis</h1><p className="page-subtitle">Built from your competency evidence, criterion marks, target roles and data quality. Updates whenever the evidence changes.</p></div></div>
    {!data ? <p className="empty-hint">{demoMode ? "Preview mode has no evidence-based SWOT." : "Connect Supabase first."}</p> : <>
      <div className="info-callout"><span>Each item says whether it is <b>confirmed</b> by results, a <b>possibility</b> worth testing, or <b>context</b>. A competency with no evidence is never listed as a weakness. {data.change.added.length || data.change.removed.length ? `Since the last update: ${data.change.added.length} new, ${data.change.removed.length} resolved.` : data.previousAt ? "No change since the last update." : "First version of your SWOT."}</span></div>
      {/* One continuous flow — strengths, then weaknesses, opportunities, threats — so no column sits empty. */}
      <div className="swot-flow">{QUADRANTS.map(([category, label, hint]) => { const items = data.items.filter((item) => item.category === category); return <section className={`swot-group swot-${category}`} key={category}>
        <header className="swot-group-head"><h2>{label} <span className="panel-count">{items.length}</span></h2><p className="empty-hint">{hint}</p></header>
        {items.length ? items.map((item) => <SwotCard key={item.key} item={item} isNew={data.change.added.includes(item.key)} />) : <p className="empty-hint swot-none">Nothing here yet{category === "weakness" ? " — no shortfall is demonstrated by your results." : "."}</p>}
      </section>; })}</div>
      {data.change.removed.length > 0 && <section className="content-panel"><h2>Resolved since last update</h2><ul>{data.change.removed.map((item) => <li key={item.key}>{item.title}</li>)}</ul></section>}
      <section className="content-panel"><h2>Your own observations <span className="panel-count">{data.entries.length}</span></h2>{data.entries.map((entry, index) => <div className="swot-entry" key={`${entry.title}-${index}`}><strong>{entry.category}: {entry.title}</strong><p>{entry.evidence}</p>{entry.source_reference && <small>{entry.source_reference}</small>}</div>)}<SwotForm /></section>
    </>}
  </div></AppShell>;
}

function SwotCard({ item, isNew }: { item: SwotItem; isNew: boolean }) {
  return <article className="swot-item">
    <header><strong>{item.title}</strong><span className={`swot-basis basis-${item.basis}`}>{BASIS[item.basis]}{isNew ? " · New" : ""}</span></header>
    <p>{item.description}</p>
    {item.evidence.length > 0 && <ul>{item.evidence.map((line) => <li key={line}>{line}</li>)}</ul>}
    <small>{item.confidence} confidence · {item.impact} impact · {item.sources.map((source) => source.startsWith("https://") ? new URL(source).hostname : source).join(", ")}</small>
    <p className="swot-action"><b>Next:</b> {item.action}</p>
  </article>;
}

async function load() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string;
  // The analysis is cached per data version; the latest snapshot is read fresh so changes are recorded once.
  const [{ items, entries }, latest] = await Promise.all([
    cachedRead("swot:items", computeSwot),
    supabase.from("swot_snapshots").select("items, items_hash, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const summary = items.map(({ key, title }) => ({ key, title }));
  const hash = createHash("sha256").update(JSON.stringify(summary)).digest("hex");
  const previous = latest.data ? (latest.data.items as { key: string; title: string }[]) : null;
  const change = compareSwot(previous, items);
  // Keep a version whenever the SWOT changes, so later visits can show what is new or resolved.
  if (!latest.data || latest.data.items_hash !== hash) await supabase.from("swot_snapshots").insert({ user_id: userId, items: summary, items_hash: hash });
  return { items, change, previousAt: latest.data?.created_at ?? null, entries };
}

async function computeSwot(supabase: SupabaseClient) {
  const [inputs, profClaims, evidence, runs, held, entries] = await Promise.all([
    loadCompetencyInputs(supabase),
    supabase.from("professional_claims").select("claim, competency_id, status, evidence_id").neq("status", "withdrawn"),
    supabase.from("professional_evidence").select("id, title"),
    supabase.from("sync_runs").select("status, started_at, finished_at, message").eq("source_name", "Mesa Nexus MCP").order("started_at", { ascending: false }).limit(20),
    supabase.from("lms_unassigned_assignments").select("id").is("resolved_course_id", null),
    supabase.from("swot_entries").select("category, title, evidence, source_reference").order("created_at", { ascending: false }),
  ]);
  const domains = buildCompetencyMap(inputs);
  const competencies = domains.flatMap((domain) => domain.competencies.map((entry) => ({ id: entry.id, name: entry.name, domain: domain.name, assessment: entry.assessment, mappedAssessments: entry.mappedAssessments })));
  const stateMap = new Map(competencies.map((item) => [item.id, { state: item.assessment.state, name: item.name }]));
  const claimRows = (profClaims.data ?? []).filter((row) => row.competency_id).map((row) => ({ competencyId: row.competency_id as string, status: row.status as string }));
  const library = buildLibrary();
  const assessments = new Map(inputs.assessments.map((row) => [row.id, row]));
  const courses = new Map(inputs.courses.map((row) => [row.id, row.title]));
  const criterionGaps = inputs.submissions.flatMap((row) => {
    const overall = row.official_mark === null ? null : Number(row.official_mark);
    const assessment = assessments.get(row.assessment_id);
    return hiddenCriterionGaps(parseCriterionScores(row.official_feedback ?? ""), overall).map((gap) => ({ assessment: assessment?.title ?? "Assessment", course: courses.get(assessment?.course_id ?? "") ?? "Course", label: gap.label, score: gap.score, max: gap.max, overall: gap.overall }));
  });
  const titles = new Map((evidence.data ?? []).map((row) => [row.id as string, row.title as string]));
  const health = describeSyncHealth((runs.data ?? []) as SyncRun[]);
  const items = buildEvidenceSwot({
    competencies,
    readiness: library.map((role) => roleReadiness(role, stateMap, claimRows)),
    supportedClaims: (profClaims.data ?? []).filter((row) => row.status === "supported" || row.status === "attested").map((row) => ({ claim: row.claim as string, competency: stateMap.get(row.competency_id as string)?.name ?? "", source: titles.get(row.evidence_id as string) ?? "Professional evidence" })),
    criterionGaps,
    dataQuality: { syncWarning: health.level === "ok" ? null : health.warnings[0] ?? null, heldAssignments: (held.data ?? []).length, describedShare: null },
  });
  return { items, entries: entries.data ?? [] };
}
