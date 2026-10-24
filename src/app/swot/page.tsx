import { createHash } from "node:crypto";
import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { SwotForm } from "@/components/swot-form";
import { loadCompetencyInputs } from "@/lib/competency/load";
import { buildCompetencyMap } from "@/lib/competency/map";
import { hiddenCriterionGaps, parseCriterionScores } from "@/lib/feedback/criteria";
import { buildSwotStory, fallbackStandsOut, startHere, type EvidenceClass, type Finding, type SwotCategory } from "@/lib/insights/swot-story";
import { generateNarrative, narrativeKey, readNarrative, type CardText } from "@/lib/insights/swot-narrative";
import { describeSyncHealth, type SyncRun } from "@/lib/lms/sync-health";
import { buildLibrary } from "@/lib/roles/library";
import { roleReadiness } from "@/lib/roles/readiness";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedRead } from "@/lib/data/cached";

export const dynamic = "force-dynamic";
// The written version is produced after the response, with time for one retry.
export const maxDuration = 300;
const SECTIONS: [SwotCategory, string, string, string][] = [
  ["strength", "Strengths", "What you can build on", "No result is strong enough yet to build on with confidence. That reflects how few marks are in, not a verdict on you."],
  ["weakness", "Weaknesses", "What needs attention", "Nothing in your marked work shows a clear shortfall. Skills with no evidence are never counted as weaknesses."],
  ["opportunity", "Opportunities", "Where to focus next", "The evidence doesn't point to a clear next area yet."],
  ["threat", "Threats", "What could get in your way", "Nothing in the evidence points to an outside risk right now."],
];
const SHOWN = 3;
const CLASS_LABEL: Record<EvidenceClass, string> = { official: "Official result", ai_estimate: "AI estimate", self_reported: "Self-reported", independent_work: "Independent work", role_requirement: "Role requirement", data: "Data" };

export default async function SwotPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const data = demoMode || !hasSupabaseConfig() ? null : await load();
  const text = (finding: Finding): CardText => data?.cards[finding.key] ?? { headline: finding.headline, body: finding.body, action: finding.action };
  const first = data ? startHere(data.findings) : null;
  return <AppShell demoMode={demoMode}><div className="section-page swot-story">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> SWOT</div><h1>Where you stand</h1><p className="page-subtitle">Read from your marks, AI estimates, CV and target roles. Each card keeps its evidence one click away.</p></div></div>
    {!data ? <p className="empty-hint">{demoMode ? "Preview mode has no evidence-based SWOT." : "Connect Supabase first."}</p> : <>
      <section className="story-lead" aria-labelledby="stands-out">
        <h2 id="stands-out">What stands out</h2>
        <p>{data.standsOut}</p>
      </section>
      <div className="story-sections">{SECTIONS.map(([category, label, subtitle, empty]) => {
        const items = data.findings.filter((finding) => finding.category === category);
        return <section className={`story-section story-${category}`} key={category} aria-labelledby={`swot-${category}`}>
          <header><h2 id={`swot-${category}`}>{label}</h2><p>{subtitle}</p></header>
          {items.length ? <>
            {items.slice(0, SHOWN).map((finding) => <StoryCard key={finding.key} finding={finding} text={text(finding)} />)}
            {items.length > SHOWN && <details className="story-more"><summary>View all ({items.length - SHOWN} more)</summary>{items.slice(SHOWN).map((finding) => <StoryCard key={finding.key} finding={finding} text={text(finding)} />)}</details>}
          </> : <p className="story-empty">{empty}</p>}
        </section>;
      })}</div>
      {first && <section className="story-start" aria-labelledby="start-here"><h2 id="start-here">Start here</h2><p><strong>{(data.cards[first.key]?.headline ?? first.headline)}</strong> {nextStep(text(first).action ?? first.action)}</p></section>}
      <details className="content-panel story-own"><summary>Your own observations ({data.entries.length})</summary>{data.entries.map((entry, index) => <div className="swot-entry" key={`${entry.title}-${index}`}><strong>{entry.category}: {entry.title}</strong><p>{entry.evidence}</p>{entry.source_reference && <small>{entry.source_reference}</small>}</div>)}<SwotForm /></details>
    </>}
  </div></AppShell>;
}

const nextStep = (action: string | null) => action ? action.replace(/^next:\s*/i, "").replace(/^./, (letter) => letter.toUpperCase()) : "";

function StoryCard({ finding, text }: { finding: Finding; text: CardText }) {
  const groups = (Object.keys(CLASS_LABEL) as EvidenceClass[]).map((kind) => [kind, finding.evidence.filter((row) => row.class === kind)] as const).filter(([, rows]) => rows.length);
  return <article className="story-card">
    <h3>{text.headline}</h3>
    <p>{text.body}</p>
    {text.action && <p className="story-next"><b>Next:</b> {nextStep(text.action)}</p>}
    {finding.evidence.length > 0 && <details className="story-evidence"><summary>See evidence</summary>
      {finding.relevance && <p className="story-relevance">{finding.relevance}</p>}
      {groups.map(([kind, rows]) => <div key={kind}><h4>{CLASS_LABEL[kind]}</h4><ul>{rows.map((row, index) => <li key={`${row.label}-${index}`}><span>{row.label}</span><small>{row.detail}{row.date ? ` · ${new Date(row.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}{row.source ? ` · ${row.source}` : ""}</small></li>)}</ul></div>)}
    </details>}
  </article>;
}

async function load() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string;
  const [{ findings, entries }, latest] = await Promise.all([
    cachedRead("swot:story", computeStory),
    supabase.from("swot_snapshots").select("items, items_hash, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // Keep a version whenever the findings change, so their history is preserved.
  const summary = findings.map(({ key, headline }) => ({ key, title: headline }));
  const hash = createHash("sha256").update(JSON.stringify(summary)).digest("hex");
  if (!latest.data || latest.data.items_hash !== hash) await supabase.from("swot_snapshots").insert({ user_id: userId, items: summary, items_hash: hash });
  // The written version is keyed by the findings and the writing rules; until it exists, the built-in wording is shown.
  const key = narrativeKey(findings);
  const narrative = findings.length ? await readNarrative(supabase, key).catch(() => null) : null;
  // A page's after() callback cannot read cookies, so it reuses the client (and session) created during render.
  if (!narrative && findings.length) after(async () => { try { await generateNarrative(supabase, userId, findings); } catch { /* the built-in wording stands */ } });
  return { findings, entries, cards: narrative?.cards ?? {}, standsOut: narrative?.standsOut || fallbackStandsOut(findings) };
}

async function computeStory(supabase: SupabaseClient) {
  const [inputs, profClaims, evidence, runs, held, entries] = await Promise.all([
    loadCompetencyInputs(supabase),
    supabase.from("professional_claims").select("claim, competency_id, status, claim_type, evidence_id, supporting_evidence_id").neq("status", "withdrawn"),
    supabase.from("professional_evidence").select("id, kind"),
    supabase.from("sync_runs").select("status, started_at, finished_at, message").eq("source_name", "Mesa Nexus MCP").order("started_at", { ascending: false }).limit(20),
    supabase.from("lms_unassigned_assignments").select("id").is("resolved_course_id", null),
    supabase.from("swot_entries").select("category, title, evidence, source_reference").order("created_at", { ascending: false }),
  ]);
  const domains = buildCompetencyMap(inputs);
  const competencies = domains.flatMap((domain) => domain.competencies.map((entry) => ({ id: entry.id, name: entry.name, domain: domain.name, assessment: entry.assessment, mappedAssessments: entry.mappedAssessments })));
  const stateMap = new Map(competencies.map((item) => [item.id, { state: item.assessment.state, name: item.name }]));
  const claimRows = (profClaims.data ?? []).filter((row) => row.competency_id).map((row) => ({ competencyId: row.competency_id as string, status: row.status as string }));
  const kinds = new Map((evidence.data ?? []).map((row) => [row.id as string, row.kind as string]));
  const assessments = new Map(inputs.assessments.map((row) => [row.id, row]));
  const courses = new Map(inputs.courses.map((row) => [row.id, row.title]));
  const criterionGaps = inputs.submissions.flatMap((row) => {
    const overall = row.official_mark === null ? null : Number(row.official_mark);
    const assessment = assessments.get(row.assessment_id);
    return hiddenCriterionGaps(parseCriterionScores(row.official_feedback ?? ""), overall).map((gap) => ({ assessment: assessment?.title ?? "Assessment", course: courses.get(assessment?.course_id ?? "") ?? "Course", label: gap.label, score: gap.score, max: gap.max, overall: gap.overall }));
  });
  const health = describeSyncHealth((runs.data ?? []) as SyncRun[]);
  const findings = buildSwotStory({
    competencies,
    readiness: buildLibrary().map((role) => roleReadiness(role, stateMap, claimRows)),
    claims: (profClaims.data ?? []).map((row) => ({ claim: row.claim as string, competencyId: (row.competency_id as string | null) ?? null, claimType: row.claim_type as string, status: row.status as string, fromKind: kinds.get(row.evidence_id as string) ?? "resume", supportedByKind: row.supporting_evidence_id ? kinds.get(row.supporting_evidence_id as string) ?? null : null })),
    criterionGaps,
    coverage: { assessments: inputs.assessments.length, officialMarks: new Set(inputs.submissions.filter((row) => row.official_mark !== null).map((row) => row.assessment_id)).size },
    dataQuality: { syncWarning: health.level === "ok" ? null : health.warnings[0] ?? null, heldAssignments: (held.data ?? []).length },
  });
  return { findings, entries: entries.data ?? [] };
}
