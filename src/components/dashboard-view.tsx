import Link from "next/link";
import { ArrowDown, ArrowRight, FileText } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { ProfileGlance } from "@/components/profile-glance";
import type { Glance } from "@/lib/profile/glance";
import { formatOfficialMark } from "@/lib/scoring";
import { IntelligenceVisual } from "@/components/intelligence-visual";
import { CountUp, ParallaxHero } from "@/components/motion";
import { Why } from "@/components/why";
import { BriefRefresh } from "@/components/brief-refresh";
import { RefreshEverything } from "@/components/refresh-everything";
import { WeeklyQuest } from "@/components/weekly-quest";
import type { CourseStanding } from "@/lib/insights/course-standing";

const shortCourse = (name: string) => name.replace(/\s+with\s+.*$/i, "");

// The overview reads top-down: a one-line summary, four highlights, then the breakdown. Reasoning sits
// behind "Why?" so the page leads with what the evidence shows rather than how it was worked out.
export function DashboardView({ data, name = "there", glance = null }: { data: DashboardSnapshot; name?: string; glance?: Glance | null }) {
  const average = data.averageMark;
  const marked = data.coursePerformance.filter((row) => row.weighted !== null).sort((a, b) => b.weighted! - a.weighted!);
  const best = marked[0];
  const weakest = marked.length > 1 ? marked[marked.length - 1] : undefined;
  const attention = weakest && (weakest.weighted! < 65 || best.weighted! - weakest.weighted! >= 10) ? weakest : undefined;
  const readiness = data.insights?.readiness ?? [];
  const grading = data.insights?.grading ?? null;
  const markedCount = data.insights?.markedAssessments ?? data.markCount;

  const brief = data.brief?.brief ?? null;
  const headline = brief ? <>{brief.headline}</> : !best
    ? <>Your story starts with <em>your first mark.</em></>
    : attention
      ? <>Strongest in <em>{shortCourse(best.course)}</em>; {shortCourse(attention.course)} needs attention.</>
      : <>Consistently strong, led by <em>{shortCourse(best.course)}.</em></>;

  return (
    <div className="dashboard-page page-enter">
      <ParallaxHero className="overview-hero summary-hero">
        <div className="overview-hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> Your summary</div>
          <h1>{headline}</h1>
          {brief?.summary && <p className="summary-text">{brief.summary}</p>}
          <p className="summary-line">{average === null ? "No marks yet" : <><b>{average}</b> weighted average</>} · <b>{markedCount}</b> of {data.assessmentCount} assessments marked{data.insights ? <> · <b>{data.insights.competenciesAssessed}</b> of {data.insights.competenciesTotal} competencies evidenced</> : null}</p>
          <div className="hero-actions"><a href="#breakdown" className="button button-light">The breakdown <ArrowDown size={15} /></a>{!data.demoMode && <BriefRefresh term={data.term} hasBrief={Boolean(brief)} />}{!data.demoMode && <RefreshEverything />}{data.syncHealth && data.syncHealth.level !== "ok" && <Link href="/marks" className="sync-chip">LMS sync {data.syncHealth.level === "warning" ? "partial" : "needs attention"} ·  details</Link>}</div>
        </div>
        <IntelligenceVisual />
      </ParallaxHero>


      {!data.demoMode && data.courses.length === 0 && data.assessmentCount === 0 && data.marks.length === 0 && <div className="info-callout" role="status"><span><strong>No Mesa records yet.</strong> Run an LMS sync from Marks & feedback to begin.</span></div>}

      {!data.demoMode && <WeeklyQuest name={name} suggestions={[...(brief?.focus ?? []).map((title) => ({ title: title.slice(0, 200), reason: "From your AI summary" })), ...(data.insights?.focus ?? []).map((item) => ({ title: item.title.slice(0, 200), reason: item.why.slice(0, 300) }))]} />}

      {brief && (brief.about || brief.changes?.length || brief.objectives?.length) ? <section className="you-summary" aria-label="About you">
        {brief.about && <article className="you-card"><span className="eyebrow"><span className="eyebrow-line" /> About you</span><p>{brief.about}</p></article>}
        {brief.changes && brief.changes.length > 0 && <article className="you-card"><span className="eyebrow"><span className="eyebrow-line" /> Your last 30 days</span><ul>{brief.changes.map((item) => <li key={item.what}><strong>{item.what}</strong><small>{item.evidence}</small></li>)}</ul></article>}
        {brief.objectives && brief.objectives.length > 0 && <article className="you-card"><span className="eyebrow"><span className="eyebrow-line" /> Your objectives</span><ul>{brief.objectives.map((item) => <li key={item.objective}><span className={`objective-status status-${item.status}`}>{item.status === "met" ? "met" : item.status === "on_track" ? "on track" : "not yet"}</span><strong>{item.objective}</strong><small>{item.detail}</small></li>)}</ul></article>}
      </section> : null}
      {brief && brief.focus.length > 0 && <section className="brief-focus this-week"><span className="eyebrow"><span className="eyebrow-line" /> Focus this week</span><ol>{brief.focus.map((item) => <li key={item}>{item}</li>)}</ol></section>}

      {brief && <section className="brief-insights" aria-label="Insights">{brief.insights.map((item) => <article key={item.title} className={`brief-card kind-${item.kind}`}><span className="brief-kind">{item.kind}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)}</section>}
      {brief && <small className="scope-note brief-source">AI-written from the figures on this page · {data.brief?.model} · {new Date(data.brief!.createdAt).toLocaleString()}</small>}

      {glance && <ProfileGlance glance={glance} />}

      <section className="highlight-grid" aria-label="Highlights">
        <Highlight label="Weighted average" tone="mint" ring={average === null ? null : average / 100} value={average === null ? "—" : `${average}`} unit={average === null ? "" : "/100"}
          insight={average === null ? "Appears with your first released mark." : average >= 85 ? "Excellent across what has been marked." : average >= 65 ? "Solid, with room to push above 80." : "Below where you want it — see what needs attention."}>
          Every mark is weighted by its assessment&apos;s maximum marks, so a 100-mark end-term counts five times a 20-mark quiz.{data.unweightedAverage !== null && data.unweightedAverage !== average ? ` A simple average would be ${data.unweightedAverage}.` : ""} Based on {data.markCount} released mark{data.markCount === 1 ? "" : "s"}.
        </Highlight>
        <Highlight label="Strongest course" tone="blue" ring={best ? best.weighted! / 100 : null} value={best ? `${best.weighted}` : "—"} unit={best ? "/100" : ""}
          insight={best ? shortCourse(best.course) : "Appears once a course has a mark."}>
          {best ? `${best.marked} of ${best.total} assessments in this course have released marks, totalling ${best.maxMarks} marks. ${best.marked < best.total ? "More marks will confirm or adjust this." : ""}` : "No course has a released mark yet."}
        </Highlight>
        <Highlight label="Needs attention" tone="amber" ring={attention ? attention.weighted! / 100 : null} value={attention ? `${attention.weighted}` : "—"} unit={attention ? "/100" : ""}
          insight={attention ? shortCourse(attention.course) : marked.length > 1 ? "No course stands out as weak." : "Needs at least two marked courses."}>
          {attention ? `This is your lowest-marked course (${attention.marked} of ${attention.total} assessments marked). One low result is a signal to look at, not a verdict on ability — the roadmap suggests a quick check.` : "A course is flagged when it sits below 65 or at least 10 points under your strongest."}
        </Highlight>
        <Highlight label="AI vs faculty" tone="violet" ring={grading?.compared ? grading.close / grading.compared : null} value={grading?.compared ? `${grading.close}` : grading?.graded ? `${grading.graded}` : "—"} unit={grading?.compared ? `of ${grading.compared}` : grading?.graded ? "graded" : ""}
          insight={grading?.compared ? `AI grades land within 7.5 points of your faculty${grading.meanGap !== null ? ` (typical gap ${grading.meanGap})` : ""}.` : grading?.graded ? "Graded; waiting for official marks to compare." : "Not graded yet."} href="/grading">
          Each submission is graded twice against your course material: by code (coverage of the rubric and course concepts) and by an AI that never sees the official mark. The three are shown side by side and never averaged.
        </Highlight>
      </section>

      <div id="breakdown" className="breakdown-heading"><span className="eyebrow"><span className="eyebrow-line" /> The breakdown</span><h2>Where the numbers come from</h2></div>

      <section className="insight-grid">
        <article className="panel performance-panel">
          <div className="panel-heading"><div><h2>By course, for your target roles</h2></div><Link className="text-link" href="/grading">Graded work <ArrowRight size={14} /></Link></div>
          {data.standings.length ? <div className="standing-table">{data.standings.sort((a, b) => (b.standing ?? -1) - (a.standing ?? -1)).map((row) => <StandingRow key={row.courseId} row={row} />)}</div> : <p className="empty-hint">No courses in this term yet.</p>}
          <Why>Standing is your official weighted average; where some work is graded only by the AI, the estimate including those grades is shown beneath it, never instead. Courses without any official mark show the AI grade, marked “AI”. Courses assessed through MRS are read against the cohort's highest score. “Shown” is how much of the course's assessment weight has a mark or a grading. A course is core for a role when it assesses a large share of that role's skills (bar 75) and supporting otherwise (bar 65).</Why>
        </article>

        <article className="panel focus-panel">
          <div className="panel-heading"><div><h2>Do next</h2></div><Link className="text-link" href="/roadmap">Roadmap <ArrowRight size={14} /></Link></div>
          {data.insights?.focus.length ? <ol className="do-next">{data.insights.focus.map((item) => <li key={item.title}><strong>{item.title}</strong><em>{item.tag}</em><Why>{item.why}</Why></li>)}</ol> : <p className="empty-hint">Suggestions appear once assessments carry evidence.</p>}
        </article>
      </section>

      <section className="lower-grid">
        <article className="panel mastery-panel">
          <div className="panel-heading"><div><h2>Target roles</h2></div><Link className="text-link" href="/career">Career readiness <ArrowRight size={14} /></Link></div>
          {readiness.length ? <div className="readiness-list">{readiness.map((role) => <div className="readiness-row" key={role.role}><span><strong>{role.role}</strong><small>{role.evidenced} of {role.total} skills evidenced{role.demonstrated !== undefined ? ` · ${role.demonstrated} demonstrated, ${role.partial} partly shown, ${role.claimed} from your CV` : ""}</small></span><span className="readiness-track"><i style={{ width: `${role.total ? Math.round((role.evidenced / role.total) * 100) : 0}%` }} /></span><b>{role.total ? Math.round((role.evidenced / role.total) * 100) : 0}%</b></div>)}</div> : <p className="empty-hint">Appears once assessments are mapped to competencies.</p>}
          {readiness.length > 0 && <Why>Requirements come from real job postings for these roles. A skill counts as evidenced when your assessed work demonstrates or partly demonstrates the competency behind it, or a supported CV claim covers it. Each role is counted on its own, and a skill asked for in two postings counts once. Experience and degree requirements are listed on Career readiness and never counted as skill gaps.</Why>}
        </article>

        <article className="panel recent-panel">
          <div className="panel-heading"><div><h2>Latest marks</h2></div><Link className="text-link" href="/marks">All <ArrowRight size={14} /></Link></div>
          {data.marks.length ? <div className="recent-list">{data.marks.slice(0, 4).map((item) => <div className="recent-row" key={item.id}>
            <span className="assessment-icon icon-mint"><FileText size={16} /></span>
            <span className="recent-info"><strong>{item.title}</strong><small>{shortCourse(item.course)}</small></span>
            <span className="recent-mark">{formatOfficialMark(item.mark)}</span>
          </div>)}</div> : <p className="empty-hint">Marks appear here after the LMS sync.</p>}
        </article>
      </section>

    </div>
  );
}

function Highlight({ label, value, unit, insight, ring, tone, href, children }: { label: string; value: string; unit: string; insight: string; ring: number | null; tone: string; href?: string; children: React.ReactNode }) {
  const circumference = 2 * Math.PI * 34;
  const share = ring === null ? 0 : Math.max(0, Math.min(1, ring));
  return <article className={`metric-card highlight-card ring-${tone}`}>
    <div className="highlight-top">
      <span className="ring-label">{label}</span>
      <svg viewBox="0 0 80 80" className="ring ring-small" aria-hidden="true"><circle cx="40" cy="40" r="34" className="ring-track" /><circle cx="40" cy="40" r="34" className="ring-value" style={{ strokeDasharray: circumference, ["--ring-offset" as string]: `${circumference * (1 - share)}`, ["--ring-full" as string]: `${circumference}` }} /></svg>
    </div>
    <strong className="highlight-value"><CountUp value={value} /><small>{unit}</small></strong>
    <p className="highlight-insight">{href ? <Link href={href}>{insight} <ArrowRight size={12} /></Link> : insight}</p>
    <Why>{children}</Why>
  </article>;
}

const VERDICT_LABEL = { sufficient: "enough", needs_work: "needs work", not_yet_evidenced: "not yet shown", awaiting_results: "results due" } as const;
const shortRole = (role: string) => role.replace(/Senior Technical Product Manager/i, "Sr TPM").replace(/Forward Deployed Engineer/i, "FDE");

function StandingRow({ row }: { row: CourseStanding }) {
  return <div className="standing-row">
    <span className="standing-name"><strong>{row.title.replace(/\s+with\s+.*$/i, "")}</strong><small>{row.context?.assessedBy ? `assessed via ${row.context.assessedBy}${row.context.expected ? ` · due ${row.context.expected}` : ""}${row.context.scaleMax ? ` · cohort high ${row.context.scaleMax}` : ""}` : `official marks cover ${Math.round(row.officialShare * 100)}% of the course weight${row.demonstratedShare > row.officialShare ? ` · ${Math.round(row.demonstratedShare * 100)}% with AI grades` : ""}`}</small></span>
    <span className={`standing-value basis-${row.basis}`}>{row.standing === null ? "—" : row.standing}{row.basis === "ai" && <em>AI</em>}{row.basis === "mixed" && row.projected !== null && row.projected !== row.standing && <small className="standing-projected">with AI estimates {row.projected}</small>}</span>
    <span className="standing-roles">{row.roles.map((role) => <span key={role.role} className={`role-chip verdict-${role.verdict}`} title={`${role.why} Dashboard benchmark for a ${role.relevance} course: ${role.threshold}/100 (an internal convention, not an employer requirement).`}>{shortRole(role.role)} · {role.relevance} · {VERDICT_LABEL[role.verdict]}</span>)}</span>
  </div>;
}
