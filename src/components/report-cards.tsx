import type { ReportCardCourse } from "@/lib/lms/report-card";
import type { ReportComponent, ReportCourseBreakdown, ReportOutClass } from "@/lib/imports/report-card-pdf";

export type ReportCardRow = {
  term: string; program: string; overall_grade: string; gpa: number | null; cgpa: number | null; credits_earned: number | null; credits_attempted: number | null;
  attendance_pct: number | null; courses: ReportCardCourse[]; fetched_at: string;
  breakdown: ReportCourseBreakdown[]; out_class: ReportOutClass[]; breakdown_generated_on: string | null; breakdown_imported_at: string | null;
};

const num = (value: number | string | null | undefined) => (value === null || value === undefined || value === "" ? null : Number(value));
const fmt = (value: number | null, digits = 2) => (value === null ? "—" : new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value));
// Compared without spaces: the grade report PDF can split a name ("Prof. N arahari").
const key = (name: string) => name.toLowerCase().replace(/\s+/g, "");
const shortName = (name: string) => name.replace(/\s+with\s+.*$/i, "");
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

// Points a component cost: its weight minus what was earned of it.
const lost = (item: ReportComponent) => (item.max > 0 ? item.weightPct - item.weightPct * item.marks / item.max : 0);

// Official term report cards from Nexus (Attendance & Grade → Grade), read at a glance: the term in four figures,
// then each course as a bar, best first, with where it lost the most points. Opening a course lists every component.
// Course percentages are not folded into assessment averages, so no mark is counted twice.
export function ReportCards({ cards }: { cards: ReportCardRow[] }) {
  if (!cards.length) return null;
  return <section className="content-panel report-cards"><h2>Report card</h2>
    {cards.map((card) => {
      const breakdownOf = new Map((card.breakdown ?? []).map((course) => [key(course.course), course]));
      const rows = (card.courses.length ? card.courses : (card.breakdown ?? []).map((item) => ({ course: item.course, credits: null, grade: item.grade, gpa: null, percentage: item.cumulative, failed: false })))
        .map((course) => ({ course, breakdown: breakdownOf.get(key(course.course)) ?? null }))
        .sort((a, b) => (num(b.course.percentage) ?? -1) - (num(a.course.percentage) ?? -1));
      const outClass = card.out_class ?? [];
      return <article key={card.term} className="report-card">
        <h3>{card.term}{card.program ? <small> · {card.program}</small> : null}</h3>
        <div className="report-tiles">
          <div className="report-tile report-tile-main"><span>Term GPA</span><strong>{fmt(num(card.gpa))}</strong><em>{card.overall_grade || "—"}</em></div>
          <div className="report-tile"><span>Credits</span><strong>{fmt(num(card.credits_earned), 1)}<small>/{fmt(num(card.credits_attempted), 1)}</small></strong></div>
          <div className="report-tile"><span>Attendance</span><strong>{fmt(num(card.attendance_pct), 1)}<small>%</small></strong></div>
          {outClass.map((item) => <div key={item.name} className="report-tile"><span>{item.name.replace(/\s*\(.*\)$/, "")}</span><strong>{fmt(item.score)}<small>/{fmt(item.outOf)}</small></strong><em>{item.grade}</em></div>)}
        </div>
        <ol className="report-courses">{rows.map(({ course, breakdown }) => {
          const percent = num(course.percentage);
          const costliest = breakdown ? [...breakdown.components].filter((item) => lost(item) >= 0.5).sort((a, b) => lost(b) - lost(a)).slice(0, 2) : [];
          return <li key={course.course}><details>
            <summary title={course.course}>
              <span className="report-course-name"><strong>{shortName(course.course)}</strong>
                <small>{breakdown ? costliest.length ? `Lost most on ${costliest.map((item) => `${item.name} (−${fmt(lost(item), 1)})`).join(", ")}` : "Full marks on every component" : "Components not imported"}</small></span>
              <span className="report-bar" aria-hidden><i style={{ width: `${Math.max(2, Math.min(100, percent ?? 0))}%` }} /></span>
              <span className="report-percent">{fmt(percent, 1)}%</span>
              <span className="report-grade">{course.grade || breakdown?.grade || "—"}</span>
              <span className="report-credits">{fmt(num(course.credits), 1)} cr</span>
            </summary>
            {breakdown ? <div className="report-components">
              <p className="scope-note">{course.course} · grade points {fmt(num(course.gpa))} · each row: marks out of its maximum, its weight, and the points it cost.</p>
              <ul>{[...breakdown.components].sort((a, b) => lost(b) - lost(a)).map((item) => {
                const share = item.max > 0 ? item.marks / item.max * 100 : 0;
                return <li key={item.name}>
                  <span className="report-component-name">{item.name}</span>
                  <span className="report-bar report-bar-thin" aria-hidden><i style={{ width: `${Math.max(2, Math.min(100, share))}%` }} /></span>
                  <span>{fmt(item.marks)}/{fmt(item.max)}</span>
                  <span className="report-weight">{fmt(item.weightPct)}% weight</span>
                  <span className={lost(item) >= 0.5 ? "report-lost" : "report-full"}>{lost(item) >= 0.05 ? `−${fmt(lost(item), 1)} pts` : "full"}</span>
                </li>;
              })}</ul>
              {breakdown.agrees === false && <p className="form-error">The printed total ({breakdown.cumulative}) does not follow from these components ({breakdown.computed}). Check with the course office; this page shows both and corrects neither.</p>}
            </div> : <p className="scope-note">Import the grade report PDF to see this course's components.</p>}
          </details></li>;
        })}</ol>
        <small className="scope-note">Official, from Nexus. Totals read {shortDate(card.fetched_at)} by the daily sync{card.breakdown_imported_at ? `; components from the grade report${card.breakdown_generated_on ? ` of ${shortDate(card.breakdown_generated_on)}` : ""}` : ""}. Kept separate from assessment marks. Open a course for every component.</small>
      </article>;
    })}
  </section>;
}
