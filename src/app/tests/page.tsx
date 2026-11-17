import type { SupabaseClient } from "@supabase/supabase-js";
import { AppShell } from "@/components/app-shell";
import { Cue } from "@/components/cue";
import { ExternalAssessmentsForm } from "@/components/external-assessments";
import { cliftonDomains, sixteenPToBigFive } from "@/lib/tests/external";
import { NEO_TRAITS, doubtfulFacet, neoOnDashboardScale, standoutFacets } from "@/lib/tests/ipip-neo";
import { ContextReadingRefresh } from "@/components/context-reading-refresh";
import { Radar } from "@/components/radar";
import { SkillsRadar } from "@/components/skills-radar";
import { PersonalityQuestionnaire, ReasoningTest } from "@/components/self-tests";
import { Why } from "@/components/why";
import { cachedRead } from "@/lib/data/cached";
import { FACTORS, loadGlance } from "@/lib/profile/glance";
import { netSummary } from "@/lib/profile/net-summary";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { FACTOR_LABELS, FACTOR_READINGS } from "@/lib/tests/personality";
import { BASIS, FACTOR_RESEARCH, READING_CAVEAT, STUDIES } from "@/lib/tests/research";

// A citation that links to the paper (DOI) or source.
function Cite({ id }: { id: string }) {
  const study = STUDIES.find((item) => item.key === id);
  return study ? <a href={study.url} target="_blank" rel="noreferrer">{study.citation}</a> : null;
}

export const dynamic = "force-dynamic";

const SHORT: Record<string, string> = { extraversion: "Extraversion", agreeableness: "Agreeableness", conscientiousness: "Conscientious-\nness", neuroticism: "Emotional\nstability", intellect: "Intellect" };
// Emotional stability (the opposite pole of neuroticism) is drawn so that further out always reads as "more".
const radial = (factor: string, score: number | null | undefined) => (score === null || score === undefined ? null : factor === "neuroticism" ? 6 - score : score);

export default async function TestsPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const glance = demoMode || !hasSupabaseConfig() ? null : await cachedRead("tests:glance", (client: SupabaseClient) => loadGlance(client));
  const history = demoMode || !hasSupabaseConfig() ? [] : await cachedRead("tests:history", loadHistory);
  const summary = glance ? netSummary(glance) : null;
  const sixteen = glance?.external.sixteenP ? sixteenPToBigFive(glance.external.sixteenP) : null;
  const neo = glance?.external.neo ?? null;
  const neoScale = neo ? neoOnDashboardScale(neo) : null;
  const NEO_OF: Record<string, keyof NonNullable<typeof neo>["traits"]> = { extraversion: "extraversion", agreeableness: "agreeableness", conscientiousness: "conscientiousness", neuroticism: "neuroticism", intellect: "openness" };
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Self-assessments</div><h1>Reasoning & personality</h1><p className="page-subtitle">{summary?.headline ?? "Inputs that add evidence where coursework has none."}</p></div></div>

    {glance && summary && <section className="content-panel net-summary" aria-label="What it adds up to">
      <h2>What it adds up to</h2>
      <div className="net-points">{summary.points.map((point) => <div key={point.title} className="net-point"><h3>{point.title}</h3><p>{point.text}</p>{point.cite && <Why label="Sources"><ul className="cite-list">{point.cite.map((key) => <li key={key}><Cite id={key} /></li>)}</ul></Why>}</div>)}</div>
      {summary.open && <p className="net-open"><b>Open question:</b> {summary.open}</p>}
      <p className="scope-note">Self-administered and unproctored; research findings are averages across many people, not predictions about you. Kept separate from official marks.</p>
    </section>}

    {glance && <section className="radar-grid" aria-label="Profile infographics">
      <Radar title="Personality" axes={FACTORS.map((factor) => SHORT[factor])} max={5} rings={5}
        series={[{ label: "How you answered", tone: "rose", values: FACTORS.map((factor) => radial(factor, glance.self?.[factor])) }, ...(neoScale ? [{ label: `${neo!.form}`, tone: "gold" as const, values: FACTORS.map((factor) => radial(factor, neoScale[factor])) }] : []), { label: "From your written context", tone: "dusk", values: FACTORS.map((factor) => radial(factor, glance.context?.factors[factor]?.score)) }, ...(sixteen ? [{ label: "16Personalities (approx.)", tone: "gold" as const, values: FACTORS.map((factor) => radial(factor, sixteen[factor])) }] : [])]}
        caption="1–5 on the IPIP response scale; 3 is neutral. Emotional stability is neuroticism reversed." />
      <Radar title="Reasoning by section" axes={["Numerical", "Logical", "Verbal"]} max={100} rings={4}
        series={glance.reasoning.map((row, index) => ({ label: `${row.level[0].toUpperCase()}${row.level.slice(1)} · ${row.correct}/${row.total}`, tone: (["gold", "rose", "moss"] as const)[index % 3], values: [row.sections.numerical, row.sections.logical, row.sections.verbal] }))}
        caption={glance.reasoning.length ? "% correct on your latest attempt at each level." : "Take a reasoning test to draw this."} />
      <SkillsRadar skills={glance.skills} aiDate={glance.aiViewDate} />
    </section>}

    {glance && <section className="content-panel" aria-label="Personality, two readings">
      <div className="panel-head"><h2>Personality, two readings</h2><ContextReadingRefresh hasReading={Boolean(glance.context)} /></div>
      <p className="empty-hint">How you answered the questionnaire, beside a reading of what you have written about yourself — your note, your assistants&apos; profiles and the patterns seen in your coursework. {glance.context ? `Context read ${new Date(glance.context.date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}.` : "No context reading yet."}</p>
      <div className={`trait-table${neo ? " has-neo" : ""}`} role="table">
        <div className="trait-head" role="row"><span>Trait</span><span>How you answered</span>{neo && <span>{neo.form}</span>}<span>From your context</span><span>What research links it to</span></div>
        {FACTORS.map((factor) => { const self = glance.self?.[factor]; const context = glance.context?.factors[factor]; return <div key={factor} className="trait-row" role="row">
          <span><strong><Cue label={factor === "neuroticism" ? "Emotional stability" : FACTOR_LABELS[factor].split(" ")[0].replace("Intellect", "Intellect")}>{FACTOR_LABELS[factor]}</Cue></strong><Why label="How to read this">{FACTOR_READINGS[factor]}</Why></span>
          <span className="trait-score">{self === undefined ? "—" : `${self.toFixed(1)}/5`}</span>
          {neo && neoScale && <span className="trait-score">{neoScale[factor].toFixed(1)}/5<small>{neo.traits[NEO_OF[factor]].percentile !== null ? (factor === "neuroticism" ? `steadier than ${100 - neo.traits[NEO_OF[factor]].percentile!}% of ${neo.normGroup.toLowerCase() || "the comparison group"}` : `higher than ${neo.traits[NEO_OF[factor]].percentile}% of ${neo.normGroup.toLowerCase() || "the comparison group"}`) : ""}{factor === "intellect" ? " (Openness; the 1–5 figure uses its Intellect and Imagination facets)" : ""}</small></span>}
          <span className="trait-score">{context?.score === null || context?.score === undefined ? <small>not enough context</small> : <>{context.score.toFixed(1)}/5<small>{context.confidence} confidence</small></>}{context?.reason && context.score !== null && <Why label="Why"><p>{context.reason}</p>{context.quote && <q>{context.quote}</q>}</Why>}</span>
          <span><small>{FACTOR_RESEARCH[factor].strengths}</small><Why label="Caveat and sources"><p>{FACTOR_RESEARCH[factor].watch}</p><ul className="cite-list">{FACTOR_RESEARCH[factor].studies.map((key) => <li key={key}><Cite id={key} /></li>)}</ul></Why></span>
        </div>; })}
      </div>
      {glance.context?.summary && <p className="scope-note"><b>What your writing shows:</b> {glance.context.summary}</p>}
      {glance.note && <p className="scope-note"><b>Your own note:</b> {glance.note}</p>}
      <Why label="Why the two readings can differ">{READING_CAVEAT}</Why>
    </section>}

    {neo && <section className="content-panel neo-result" aria-label="Big Five facets">
      <h2>{neo.form}: your thirty facets</h2>
      <p className="empty-hint">Taken {neo.takenOn ? new Date(`${neo.takenOn}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "on an unknown date"}{neo.durationSeconds ? ` in ${Math.round(neo.durationSeconds / 60)} minutes` : ""}. Self-report, like the questionnaire above, but {neo.form.replace("IPIP-NEO-", "")} statements long. Percentiles are the test site&apos;s own comparison with {neo.normGroup.toLowerCase() || "its sample"}{neo.normNote ? ` (${neo.normNote})` : ""}.</p>
      {neo.anomalies.length > 0 && <ul className="neo-anomalies">{neo.anomalies.map((item) => <li key={item}>{item}</li>)}</ul>}
      <div className="neo-traits">{NEO_TRAITS.map((trait) => {
        const score = neo.traits[trait.key];
        // Neuroticism is drawn as its opposite pole, emotional stability, as elsewhere on this page, so a longer bar
        // always reads as "more": a facet at the 1st percentile is steadier than 99% of the group.
        const steady = trait.key === "neuroticism";
        const shown = (percentile: number | null) => (percentile === null ? null : steady ? 100 - percentile : percentile);
        return <div key={trait.key} className="neo-trait">
          <h3>{steady ? "Emotional stability" : trait.label} <small>{score.raw}/{score.max} {steady ? "neuroticism" : ""} · {steady ? `steadier than ${shown(score.percentile) ?? "—"}%` : `higher than ${score.percentile ?? "—"}%`}</small></h3>
          <ul>{neo.facets.filter((facet) => facet.trait === trait.key).map((facet) => <li key={facet.name} className={standoutFacets(neo).some((item) => item.name === facet.name) ? "neo-standout" : ""}><span>{steady ? `Low ${facet.name.toLowerCase()}` : facet.name}{doubtfulFacet(neo, facet.name) ? " *" : ""}</span><span className="report-bar report-bar-thin" aria-hidden><i style={{ width: `${Math.max(2, shown(facet.percentile) ?? 0)}%` }} /></span><span>{shown(facet.percentile) ?? "—"}%</span></li>)}</ul>
        </div>;
      })}</div>
      <p className="scope-note">Bars show how many of the comparison group you score above; for emotional stability, how many you are steadier than.{neo.facets.some((facet) => doubtfulFacet(neo, facet.name)) ? " * The report states this facet inconsistently (see above), so it is not used in any summary." : ""}</p>
      {standoutFacets(neo).length > 0 && <p className="scope-note"><b>Facets that break from their trait</b> (25+ percentile points): {standoutFacets(neo).map((facet) => `${facet.name} ${facet.percentile}% within ${NEO_TRAITS.find((trait) => trait.key === facet.trait)!.label} ${facet.traitPercentile}%`).join(" · ")}. Facets often say more than the trait average.</p>}
    </section>}

    {glance && <section className="content-panel" aria-label="Other personality tools">
      <h2>Other personality tools</h2>
      <p className="empty-hint">Results you have from 16Personalities or CliftonStrengths. Both are proprietary, self-reported tools, so they are shown as context beside the IPIP questionnaire and feed the AI view and the behaviour analysis as your own description — never as a measured score, and never the reading of your written context, which stays independent of questionnaires.</p>
      <div className="external-results">
        <div><h3>16Personalities</h3>{glance.external.sixteenP ? <><p className="external-type">{glance.external.sixteenP.type}</p><small className="empty-hint">Lines up approximately with: {FACTORS.map((factor) => sixteen?.[factor] != null ? `${factor === "neuroticism" ? "emotional stability" : factor} ${(factor === "neuroticism" ? 6 - sixteen[factor]! : sixteen[factor]!).toFixed(1)}` : null).filter(Boolean).join(" · ")} (McCrae &amp; Costa, 1989).</small></> : <p className="empty-hint">Not added.</p>}</div>
        <div><h3>CliftonStrengths</h3>{glance.external.clifton.length ? <ul className="clifton-list">{cliftonDomains(glance.external.clifton).map((row) => <li key={row.domain}><strong>{row.domain}</strong><small>{row.themes.join(", ")}</small></li>)}</ul> : <p className="empty-hint">Not added.</p>}</div>
      </div>
      <Why label="Add or update results"><ExternalAssessmentsForm /></Why>
    </section>}

    <div className="section-two-column"><section className="content-panel"><h2>Reasoning test</h2><ReasoningTest />
      {history.length > 0 && <><h3 className="role-stage">Your attempts</h3><ul className="test-history">{history.map((row) => <li key={row.id}><strong>{row.result.correct}/{row.result.total}</strong> <small>{row.result.level ?? "standard"}{row.result.ability ? ` · adjusted ${row.result.ability.scaled}` : ""} · {new Date(row.submitted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} · {Object.entries(row.result.sections).map(([section, value]) => `${section} ${value.correct}/${value.total}`).join(" · ")}{row.result.overtime ? " · over time" : ""}</small></li>)}</ul></>}</section>
      <aside className="content-panel"><h2>Personality questionnaire</h2><p className="scope-note">Statements are drawn at random from the 50 public-domain IPIP Big-Five Factor Markers (Goldberg, 1992) each time. It records how you describe yourself today, not how others see you. Saving it, with your note, refreshes the context reading and the behaviour analysis within about a minute.</p><PersonalityQuestionnaire /></aside></div>

    <section className="content-panel" aria-label="What this page rests on">
      <h2>What this page rests on</h2>
      <div className="research-basis">
        <div><h3>Backed by published research</h3><ul>{BASIS.filter((item) => item.basis === "research").map((item) => <li key={item.claim}><strong>{item.claim}</strong><small>{item.detail}</small><Why label={`Sources (${item.studies.length})`}><ul className="cite-list">{item.studies.map((key) => <li key={key}><small><Cite id={key} /></small></li>)}</ul></Why></li>)}</ul></div>
        <div><h3>This dashboard&apos;s own rules</h3><ul>{BASIS.filter((item) => item.basis === "own_rule").map((item) => <li key={item.claim}><strong>{item.claim}</strong><small>{item.detail}</small></li>)}</ul></div>
      </div>
    </section>
  </div></AppShell>;
}

type Attempt = { id: string; submitted_at: string; result: { correct: number; total: number; level?: string; ability?: { scaled: number }; sections: Record<string, { correct: number; total: number }>; overtime?: boolean } };
async function loadHistory(supabase: SupabaseClient): Promise<Attempt[]> {
  const { data } = await supabase.from("test_attempts").select("id, submitted_at, result").eq("kind", "reasoning").not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(10);
  return (data ?? []) as Attempt[];
}

