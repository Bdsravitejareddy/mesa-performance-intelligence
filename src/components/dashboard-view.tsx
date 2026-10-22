import Link from "next/link";
import { SyncHealthNotice } from "@/components/sync-health-notice";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  FileText,
  Layers3,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { formatOfficialMark } from "@/lib/scoring";
import { IntelligenceVisual } from "@/components/intelligence-visual";
import { CountUp, ParallaxHero } from "@/components/motion";
import { InsightSummary } from "@/components/insight-summary";

export function DashboardView({ data }: { data: DashboardSnapshot }) {
  const average = data.averageMark;
  const demonstrated = data.mastery.filter((item) => item.state.toLowerCase().includes("demonstrated")).length;

  return (
    <div className="dashboard-page page-enter">
      <ParallaxHero className="overview-hero">
        <div className="overview-hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> Your learning, in context</div>
          <h1>See the signal in your performance.</h1>
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

      <section className="metric-grid" aria-label="Performance summary">
        <MetricCard label="Average assessment mark" value={average === null ? "—" : formatOfficialMark(average)} meta={data.markCount ? `${data.markCount} marks · weighted by maximum marks${data.unweightedAverage !== null && data.unweightedAverage !== data.averageMark ? ` (unweighted ${data.unweightedAverage})` : ""}` : "No marks recorded"} icon={<TrendingUp size={17} />} accent="mint" />
        <MetricCard label="Courses in view" value={String(data.courses.length)} meta="Course-linked evidence" icon={<BookOpenCheck size={17} />} accent="blue" />
        <MetricCard label="Assessments" value={String(data.assessmentCount)} meta="Across linked courses" icon={<FileText size={17} />} accent="violet" />
        <MetricCard label="Topics demonstrated" value={`${demonstrated} / ${data.topicCount}`} meta="Evidence-weighted view" icon={<Target size={17} />} accent="amber" />
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
          </div> : <div className="empty-copy"><p>As course materials and feedback are linked, repeated themes will appear here.</p><Link href="/courses">Connect course content <ArrowRight size={14} /></Link></div>}
        </article>
      </section>

      <section className="lower-grid">
        <article className="panel mastery-panel">
          <div className="panel-heading"><div><h2>Course mastery</h2><p>Topic-level evidence, not a single-score verdict</p></div><Link className="text-link" href="/courses">Explore courses <ArrowRight size={14} /></Link></div>
          {data.mastery.length ? <div className="mastery-list">{data.mastery.slice(0, 5).map((item, index) => <MasteryRow key={item.topic} item={item} index={index} />)}</div> : <div className="empty-copy"><p>Course topics will appear once objectives and assessment evidence are connected.</p><Link href="/courses">Add a course <ArrowRight size={14} /></Link></div>}
          <div className="mastery-legend"><span><i className="state-dot state-good" /> Demonstrated</span><span><i className="state-dot state-review" /> Development needed</span><span><i className="state-dot state-muted" /> Not enough evidence</span></div>
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

function MetricCard({ label, value, meta, icon, accent, trend }: { label: string; value: string; meta: string; icon: React.ReactNode; accent: string; trend?: string }) {
  return <article className="metric-card">
    <div className="metric-top"><span>{label}</span><span className={`metric-icon metric-${accent}`}>{icon}</span></div>
    <div className="metric-value-row"><strong><CountUp value={value} /></strong>{trend && <span className="metric-trend"><ArrowUpRight size={13} /> {trend}</span>}</div>
    <small>{meta}</small>
  </article>;
}

function FocusRow({ number, title, detail, tag }: { number: string; title: string; detail: string; tag: string }) {
  return <div className="focus-row"><span className="focus-number">{number}</span><span className="focus-content"><strong>{title}</strong><small>{detail}</small><em>{tag}</em></span><ArrowDownRight size={15} className="focus-arrow" /></div>;
}

function MasteryRow({ item, index }: { item: DashboardSnapshot["mastery"][number]; index: number }) {
  const isGood = item.state.toLowerCase().includes("demonstrated");
  const isNeed = item.state.toLowerCase().includes("development");
  const bar = isGood ? "bar-good" : isNeed ? "bar-review" : "bar-muted";
  return <div className="mastery-row"><span className={`mastery-index mastery-index-${index}`}>{String(index + 1).padStart(2, "0")}</span><span className="mastery-topic"><strong>{item.topic}</strong><span className="mastery-track"><i className={bar} style={{ width: item.value === null ? "0%" : `${Math.max(6, Math.min(item.value, 100))}%` }} /></span></span><span className="mastery-value">{item.value === null ? "Not scored" : `${item.value}/100`}<small>{item.state}</small></span></div>;
}
