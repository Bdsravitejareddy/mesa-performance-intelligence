import Link from "next/link";
import { SyncHealthNotice } from "@/components/sync-health-notice";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  FileText,
  Layers3,
  Plus,
  Sparkles,
} from "lucide-react";
import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { formatOfficialMark } from "@/lib/scoring";
import { IntelligenceVisual } from "@/components/intelligence-visual";
import { CountUp, ParallaxHero, RotatingWord } from "@/components/motion";
import { InsightSummary } from "@/components/insight-summary";

export function DashboardView({ data }: { data: DashboardSnapshot }) {
  const average = data.averageMark;

  return (
    <div className="dashboard-page page-enter">
      <ParallaxHero className="overview-hero">
        <div className="overview-hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> Your learning, in context</div>
          <h1>See the signal in your <RotatingWord words={["performance.", "strengths.", "gaps.", "next moves."]} /></h1>
          <p>Connect what you were taught with the work you’ve shown, then choose what to improve next.</p>
          <Link href="/courses" className="button button-primary"><Plus size={16} /> Add course material</Link>
        </div>
        <IntelligenceVisual />
        <div className="hero-counter" aria-label={`${data.markCount} marked submissions`}>{String(data.markCount).padStart(2, "0")}<small>/ {String(data.assessmentCount).padStart(2, "0")} marked</small></div>
        <nav className="hero-links" aria-label="Evidence shortcuts"><Link href="/evidence">Evidence</Link><Link href="/competencies">Competencies</Link><Link href="/marks">Marks</Link></nav>
      </ParallaxHero>

      <InsightSummary demoMode={data.demoMode} />

      {data.syncHealth && data.syncHealth.level !== "ok" && <SyncHealthNotice health={data.syncHealth} compact />}

      {!data.demoMode && data.courses.length === 0 && data.assessmentCount === 0 && data.marks.length === 0 && <div className="info-callout" role="status"><span><strong>No Mesa records have been imported.</strong> Run an LMS sync from Marks & feedback, or add a course and its materials to start recording assessment evidence. <Link href="/courses" className="text-link">Open courses <ArrowRight size={14} /></Link></span></div>}

      <section className="metric-grid ring-grid" aria-label="Performance summary">
        <RingCard label="Weighted average" value={average} max={100} display={average === null ? "—" : `${average}`} suffix={average === null ? "" : "/100"} meta={data.markCount ? `${data.markCount} marks · weighted by maximum marks${data.unweightedAverage !== null && data.unweightedAverage !== data.averageMark ? ` (unweighted ${data.unweightedAverage})` : ""}` : "No marks recorded"} tone="mint" />
        <RingCard label="Assessments marked" value={data.insights?.markedAssessments ?? data.markCount} max={Math.max(data.assessmentCount, 1)} display={String(data.insights?.markedAssessments ?? data.markCount)} suffix={` of ${data.assessmentCount}`} meta="Released marks across your courses" tone="blue" />
        <RingCard label="Competencies evidenced" value={data.insights?.competenciesAssessed ?? 0} max={Math.max(data.insights?.competenciesTotal ?? 35, 1)} display={String(data.insights?.competenciesAssessed ?? 0)} suffix={` of ${data.insights?.competenciesTotal ?? 35}`} meta={data.insights ? `${data.insights.strengths} strengths · ${data.insights.gaps} development areas` : "Map assessments to start"} tone="violet" />
        <RingCard label="Stage 1 readiness" value={(data.insights?.readiness ?? []).reduce((sum, role) => sum + role.evidenced, 0)} max={Math.max((data.insights?.readiness ?? []).reduce((sum, role) => sum + role.total, 0), 1)} display={String((data.insights?.readiness ?? []).reduce((sum, role) => sum + role.evidenced, 0))} suffix={` of ${(data.insights?.readiness ?? []).reduce((sum, role) => sum + role.total, 0)}`} meta="Skill requirements evidenced for your two target roles" tone="amber" />
      </section>

      <section className="insight-grid">
        <article className="panel performance-panel">
          <div className="panel-heading">
            <div><h2>Course performance</h2><p>Weighted by each assessment&apos;s maximum marks · how much of each course is marked</p></div>
          </div>
          <div className="course-performance">{data.coursePerformance.map((row) => <div className="course-bar" key={row.course}>
            <span className="course-bar-name"><strong>{row.course.replace(/\s+with\s+.*$/i, "")}</strong><small>{row.marked} of {row.total} assessment{row.total === 1 ? "" : "s"} marked{row.marked ? ` · ${row.maxMarks} marks` : ""}</small></span>
            <span className="course-bar-track" aria-hidden><i style={{ width: `${row.weighted ?? 0}%` }} className={row.weighted === null ? "" : row.weighted >= 85 ? "bar-good" : row.weighted < 65 ? "bar-review" : "bar-muted"} /><b style={{ width: `${Math.round((row.marked / Math.max(row.total, 1)) * 100)}%` }} /></span>
            <span className="course-bar-value">{row.weighted === null ? "No marks yet" : `${row.weighted}/100`}</span>
          </div>)}</div>
          <div className="chart-footnote"><span><i className="legend-dot" /> Weighted course average</span><span>The thin line under each bar shows how much of the course has released marks.</span></div>
        </article>

        <article className="panel focus-panel">
          <div className="panel-heading"><div><h2>Next best focus</h2><p>From recurring evidence themes</p></div><span className="sparkle-badge"><Sparkles size={15} /></span></div>
          {data.demoMode ? <div className="focus-list">
            <FocusRow number="01" title="Make assumptions visible" detail="Name the denominator and time period before interpreting a ratio." tag="Quantitative" />
            <FocusRow number="02" title="Turn insight into action" detail="Link each finding to a decision the business could make." tag="Application" />
            <FocusRow number="03" title="Ground claims in evidence" detail="Tie market conclusions to a course or case source." tag="Evidence" />
          </div> : data.insights?.focus.length ? <div className="focus-list">{data.insights.focus.map((item, index) => <FocusRow key={item.title} number={String(index + 1).padStart(2, "0")} title={item.title} detail={item.why} tag={item.tag} />)}<Link className="text-link" href="/roadmap">Open the growth roadmap <ArrowRight size={14} /></Link></div> : <div className="empty-copy"><p>As course materials and feedback are linked, repeated themes will appear here.</p><Link href="/courses">Connect course content <ArrowRight size={14} /></Link></div>}
        </article>
      </section>

      <section className="lower-grid">
        <article className="panel mastery-panel">
          <div className="panel-heading"><div><h2>Readiness for your targets</h2><p>Skill requirements from real postings that your evidence covers</p></div><Link className="text-link" href="/career">Career readiness <ArrowRight size={14} /></Link></div>
          {data.insights?.readiness.length ? <div className="readiness-list">{data.insights.readiness.map((role) => <div className="readiness-row" key={role.role}><span><strong>{role.role}</strong><small>{role.evidenced} of {role.total} skill requirements evidenced</small></span><span className="readiness-track"><i style={{ width: `${role.total ? Math.round((role.evidenced / role.total) * 100) : 0}%` }} /></span><b>{role.total ? Math.round((role.evidenced / role.total) * 100) : 0}%</b></div>)}<p className="scope-note">Eligibility (years of experience, degrees) is listed separately on Career readiness and never scored as a skill gap.</p></div> : <div className="empty-copy"><p>Target-role readiness appears once assessments are mapped to competencies.</p></div>}
        </article>

        <article className="panel recent-panel">
          <div className="panel-heading"><div><h2>Recent assessments</h2><p>Marks shown as reported</p></div><Link className="text-link" href="/marks">View all <ArrowRight size={14} /></Link></div>
          {data.marks.length ? <div className="recent-list">{data.marks.slice(0, 4).map((item) => <div className="recent-row" key={item.id}>
            <span className={`assessment-icon ${item.format.toLowerCase().includes("quant") ? "icon-purple" : "icon-mint"}`}><FileText size={16} /></span>
            <span className="recent-info"><strong>{item.title}</strong><small>{item.course} <i>·</i> {item.date}</small></span>
            <span className="recent-mark">{formatOfficialMark(item.mark)}</span>
          </div>)}</div> : <div className="empty-copy"><p>Marks and evaluator feedback will appear here after they’re added or synced.</p><Link href="/marks">Open marks & feedback <ArrowRight size={14} /></Link></div>}
          <div className="reconciliation-note"><span className="note-icon"><Layers3 size={14} /></span><span>Academic, analytical, and career evaluations stay separate.</span><Link href="/assessments" aria-label="View assessment evaluations"><ArrowUpRight size={14} /></Link></div>
        </article>
      </section>

      <section className="bottom-callout">
        <div className="callout-orbit"><Sparkles size={20} /></div>
        <div><strong>Performance is more than a mark.</strong><p>Link course materials to understand why the work earned its score.</p></div>
        <Link href="/courses" className="button button-light">Explore course intelligence <ArrowRight size={15} /></Link>
      </section>
    </div>
  );
}

function FocusRow({ number, title, detail, tag }: { number: string; title: string; detail: string; tag: string }) {
  return <div className="focus-row"><span className="focus-number">{number}</span><span className="focus-content"><strong>{title}</strong><small>{detail}</small><em>{tag}</em></span><ArrowDownRight size={15} className="focus-arrow" /></div>;
}

function RingCard({ label, value, max, display, suffix, meta, tone }: { label: string; value: number | null; max: number; display: string; suffix: string; meta: string; tone: string }) {
  const share = value === null ? 0 : Math.max(0, Math.min(1, value / max));
  const circumference = 2 * Math.PI * 34;
  return <article className={`metric-card ring-card ring-${tone}`}>
    <svg viewBox="0 0 80 80" className="ring" aria-hidden="true"><circle cx="40" cy="40" r="34" className="ring-track" /><circle cx="40" cy="40" r="34" className="ring-value" style={{ strokeDasharray: circumference, ["--ring-offset" as string]: `${circumference * (1 - share)}`, ["--ring-full" as string]: `${circumference}` }} /></svg>
    <div className="ring-copy"><span className="ring-label">{label}</span><strong><CountUp value={display} /><small>{suffix}</small></strong><small>{meta}</small></div>
  </article>;
}
