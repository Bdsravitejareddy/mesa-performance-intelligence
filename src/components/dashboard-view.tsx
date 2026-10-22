import Link from "next/link";
import { SyncHealthNotice } from "@/components/sync-health-notice";
import { ArrowDown, ArrowRight, FileText } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { formatOfficialMark } from "@/lib/scoring";
import { IntelligenceVisual } from "@/components/intelligence-visual";
import { CountUp, ParallaxHero } from "@/components/motion";
import { InsightSummary } from "@/components/insight-summary";
import { Why } from "@/components/why";

const shortCourse = (name: string) => name.replace(/\s+with\s+.*$/i, "");

// The overview reads top-down: a one-line summary, four highlights, then the breakdown. Reasoning sits
// behind "Why?" so the page leads with what the evidence shows rather than how it was worked out.
export function DashboardView({ data }: { data: DashboardSnapshot }) {
  const average = data.averageMark;
  const marked = data.coursePerformance.filter((row) => row.weighted !== null).sort((a, b) => b.weighted! - a.weighted!);
  const best = marked[0];
  const weakest = marked.length > 1 ? marked[marked.length - 1] : undefined;
  const attention = weakest && (weakest.weighted! < 65 || best.weighted! - weakest.weighted! >= 10) ? weakest : undefined;
  const readiness = data.insights?.readiness ?? [];
  const evidenced = readiness.reduce((sum, role) => sum + role.evidenced, 0);
  const required = readiness.reduce((sum, role) => sum + role.total, 0);
  const grading = data.insights?.grading ?? null;
  const markedCount = data.insights?.markedAssessments ?? data.markCount;

  const headline = !best
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
          <p className="summary-line">{average === null ? "No marks yet" : <><b>{average}</b> weighted average</>} · <b>{markedCount}</b> of {data.assessmentCount} assessments marked{data.insights ? <> · <b>{data.insights.competenciesAssessed}</b> of {data.insights.competenciesTotal} competencies evidenced</> : null}</p>
          <a href="#breakdown" className="button button-light">The breakdown <ArrowDown size={15} /></a>
        </div>
        <IntelligenceVisual />
      </ParallaxHero>

      {data.syncHealth && data.syncHealth.level !== "ok" && <SyncHealthNotice health={data.syncHealth} compact />}

      {!data.demoMode && data.courses.length === 0 && data.assessmentCount === 0 && data.marks.length === 0 && <div className="info-callout" role="status"><span><strong>No Mesa records yet.</strong> Run an LMS sync from Marks & feedback to begin.</span></div>}

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
          <div className="panel-heading"><div><h2>By course</h2></div><Link className="text-link" href="/marks">Marks <ArrowRight size={14} /></Link></div>
          <div className="course-performance">{data.coursePerformance.map((row) => <div className="course-bar" key={row.course}>
            <span className="course-bar-name"><strong>{shortCourse(row.course)}</strong><small>{row.marked} of {row.total} marked</small></span>
            <span className="course-bar-track" aria-hidden><i style={{ width: `${row.weighted ?? 0}%` }} className={row.weighted === null ? "" : row.weighted >= 85 ? "bar-good" : row.weighted < 65 ? "bar-review" : "bar-muted"} /><b style={{ width: `${Math.round((row.marked / Math.max(row.total, 1)) * 100)}%` }} /></span>
            <span className="course-bar-value">{row.weighted === null ? "—" : <CountUp value={`${row.weighted}`} />}</span>
          </div>)}</div>
          <Why>Bars show each course&apos;s weighted average out of 100. The thin line under a bar shows how much of that course has released marks, so a short line means the figure rests on little evidence.</Why>
        </article>

        <article className="panel focus-panel">
          <div className="panel-heading"><div><h2>Do next</h2></div><Link className="text-link" href="/roadmap">Roadmap <ArrowRight size={14} /></Link></div>
          {data.insights?.focus.length ? <ol className="do-next">{data.insights.focus.map((item) => <li key={item.title}><strong>{item.title}</strong><em>{item.tag}</em><Why>{item.why}</Why></li>)}</ol> : <p className="empty-hint">Suggestions appear once assessments carry evidence.</p>}
        </article>
      </section>

      <section className="lower-grid">
        <article className="panel mastery-panel">
          <div className="panel-heading"><div><h2>Target roles</h2></div><Link className="text-link" href="/career">Career readiness <ArrowRight size={14} /></Link></div>
          {readiness.length ? <div className="readiness-list">{readiness.map((role) => <div className="readiness-row" key={role.role}><span><strong>{role.role}</strong><small>{role.evidenced} of {role.total} skills evidenced</small></span><span className="readiness-track"><i style={{ width: `${role.total ? Math.round((role.evidenced / role.total) * 100) : 0}%` }} /></span><b>{role.total ? Math.round((role.evidenced / role.total) * 100) : 0}%</b></div>)}</div> : <p className="empty-hint">Appears once assessments are mapped to competencies.</p>}
          {readiness.length > 0 && <Why>Requirements come from real job postings for these roles. A skill counts as evidenced when your assessed work demonstrates or partly demonstrates the competency behind it ({evidenced} of {required} so far). Experience and degree requirements are listed on Career readiness and never counted as skill gaps.</Why>}
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

      <section className="panel narrative-panel"><Why label="Read the AI-written narrative"><InsightSummary demoMode={data.demoMode} /></Why></section>
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
