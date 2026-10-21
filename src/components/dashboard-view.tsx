import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  CircleDot,
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

export function DashboardView({ data }: { data: DashboardSnapshot }) {
  const average = data.marks.length
    ? Math.round((data.marks.reduce((sum, item) => sum + item.mark, 0) / data.marks.length) * 10) / 10
    : null;
  const demonstrated = data.mastery.filter((item) => item.state.toLowerCase().includes("demonstrated")).length;

  return (
    <div className="dashboard-page page-enter">
      <section className="overview-hero">
        <div className="overview-hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR LEARNING, IN CONTEXT</div>
          <h1>See the signal in your performance.</h1>
          <p>Connect what you were taught with the work you’ve shown, then choose what to improve next.</p>
          <Link href="/courses" className="button button-primary"><Plus size={16} /> Add course material</Link>
        </div>
        <IntelligenceVisual />
      </section>

      {!data.demoMode && data.courses.length === 0 && data.assessmentCount === 0 && data.marks.length === 0 && <div className="info-callout" role="status"><span><strong>No Mesa records have been imported.</strong> LMS sync is not connected. Add a course and its materials to start recording assessment evidence. <Link href="/courses" className="text-link">Open courses <ArrowRight size={14} /></Link></span></div>}

      <section className="metric-grid" aria-label="Performance summary">
        <MetricCard label="Average assessment mark" value={average === null ? "—" : formatOfficialMark(average)} meta={data.marks.length ? `${data.marks.length} marked submissions · unweighted` : "No marks recorded"} icon={<TrendingUp size={17} />} accent="mint" />
        <MetricCard label="Courses in view" value={String(data.courses.length)} meta="Course-linked evidence" icon={<BookOpenCheck size={17} />} accent="blue" />
        <MetricCard label="Assessments" value={String(data.assessmentCount)} meta="Across linked courses" icon={<FileText size={17} />} accent="violet" />
        <MetricCard label="Topics demonstrated" value={`${demonstrated} / ${data.topicCount}`} meta="Evidence-weighted view" icon={<Target size={17} />} accent="amber" />
      </section>

      <section className="insight-grid">
        <article className="panel performance-panel">
          <div className="panel-heading">
            <div><h2>Marks over time</h2><p>Official scores on the 100-point scale</p></div>
            <div className="select-pill">All courses <CircleDot size={13} /></div>
          </div>
          {data.markSeries.length > 1 ? <MarkChart points={data.markSeries} /> : <div className="chart-empty"><span className="empty-icon"><TrendingUp size={18} /></span><p>More marked work will reveal your trend.</p></div>}
          <div className="chart-footnote"><span><i className="legend-dot" /> Marks out of 100</span><span>Unweighted marks; course grading rules are shown separately.</span></div>
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
    <div className="metric-value-row"><strong>{value}</strong>{trend && <span className="metric-trend"><ArrowUpRight size={13} /> {trend}</span>}</div>
    <small>{meta}</small>
  </article>;
}

function MarkChart({ points }: { points: { label: string; value: number }[] }) {
  const width = 660;
  const height = 205;
  const pad = { top: 12, right: 14, bottom: 28, left: 33 };
  const x = (index: number) => pad.left + (index / Math.max(points.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + ((100 - value) / 100) * (height - pad.top - pad.bottom);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.value)}`).join(" ");
  const area = `${line} L ${x(points.length - 1)} ${height - pad.bottom} L ${x(0)} ${height - pad.bottom} Z`;
  const ticks = [0, 25, 50, 75, 100];
  const change = Math.round((points.at(-1)!.value - points[0].value) * 10) / 10;

  return <div className="chart-wrap">
    <div className="chart-summary"><strong>{formatOfficialMark(points.at(-1)!.value)}</strong><span>{change > 0 ? <ArrowUpRight size={13} /> : change < 0 ? <ArrowDownRight size={13} /> : <CircleDot size={12} />} {change > 0 ? "+" : ""}{change} pts from first shown mark</span></div>
    <svg className="mark-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Official marks over time on a 0 to 100 scale">
      <defs><linearGradient id="mark-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#35b49d" stopOpacity=".23" /><stop offset="100%" stopColor="#35b49d" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((tick) => <g key={tick}><line x1={pad.left} y1={y(tick)} x2={width - pad.right} y2={y(tick)} className="chart-grid-line" /><text x={0} y={y(tick) + 4} className="chart-axis-label">{tick}</text></g>)}
      <path d={area} fill="url(#mark-fill)" />
      <path d={line} className="chart-line" />
      {points.map((point, index) => <g key={`${point.label}-${index}`}><circle cx={x(index)} cy={y(point.value)} r="4.5" className="chart-point" /><text x={x(index)} y={height - 4} textAnchor="middle" className="chart-x-label">{point.label}</text></g>)}
    </svg>
  </div>;
}

function FocusRow({ number, title, detail, tag }: { number: string; title: string; detail: string; tag: string }) {
  return <div className="focus-row"><span className="focus-number">{number}</span><span className="focus-content"><strong>{title}</strong><small>{detail}</small><em>{tag}</em></span><ArrowDownRight size={15} className="focus-arrow" /></div>;
}

function MasteryRow({ item, index }: { item: DashboardSnapshot["mastery"][number]; index: number }) {
  const isGood = item.state.toLowerCase().includes("demonstrated");
  const isNeed = item.state.toLowerCase().includes("development");
  const bar = isGood ? "bar-good" : isNeed ? "bar-review" : "bar-muted";
  return <div className="mastery-row"><span className={`mastery-index mastery-index-${index}`}>{String(index + 1).padStart(2, "0")}</span><span className="mastery-topic"><strong>{item.topic}</strong><span className="mastery-track"><i className={bar} style={{ width: `${Math.max(6, Math.min(item.value, 100))}%` }} /></span></span><span className="mastery-value">{item.value ? item.value : "—"}{item.value ? "/100" : ""}<small>{item.state}</small></span></div>;
}
