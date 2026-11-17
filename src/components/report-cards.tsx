import type { ReportCardCourse } from "@/lib/lms/report-card";
import type { ReportCourseBreakdown, ReportOutClass } from "@/lib/imports/report-card-pdf";

export type ReportCardRow = {
  term: string; program: string; overall_grade: string; gpa: number | null; cgpa: number | null; credits_earned: number | null; credits_attempted: number | null;
  attendance_pct: number | null; courses: ReportCardCourse[]; fetched_at: string;
  breakdown: ReportCourseBreakdown[]; out_class: ReportOutClass[]; breakdown_generated_on: string | null; breakdown_imported_at: string | null;
};

const value = (item: number | null | string | undefined, suffix = "") => (item === null || item === undefined || item === "" ? "—" : `${Number(item)}${suffix}`);
// Compared without spaces: the grade report PDF can split a name ("Prof. N arahari").
const key = (name: string) => name.toLowerCase().replace(/\s+/g, "");
const shortDate = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Official term report cards from Nexus (Attendance & Grade → Grade). Course totals come from the daily sync; the
// component breakdown (weight, marks obtained, maximum) from the grade report PDF. Shown as they are: course
// percentages are not folded into assessment averages, so no mark is counted twice.
export function ReportCards({ cards }: { cards: ReportCardRow[] }) {
  if (!cards.length) return null;
  return <section className="content-panel report-cards"><h2>Report cards <span className="panel-count">{cards.length}</span></h2>
    <p className="scope-note">Official term results from Nexus (Attendance &amp; Grade → Grade). Kept separate from assessment marks. Open a course to see its components.</p>
    {cards.map((card) => {
      const breakdownOf = new Map((card.breakdown ?? []).map((course) => [key(course.course), course]));
      // Courses from the sync, plus any course only the PDF lists.
      const rows = card.courses.length ? card.courses.map((course) => ({ course, breakdown: breakdownOf.get(key(course.course)) ?? null }))
        : (card.breakdown ?? []).map((item) => ({ course: { course: item.course, credits: null, grade: item.grade, gpa: null, percentage: item.cumulative, failed: false }, breakdown: item }));
      return <article key={card.term} className="report-card">
        <h3>{card.term}{card.program ? <small> · {card.program}</small> : null}</h3>
        <p className="report-card-summary"><strong>Term GPA {value(card.gpa)}</strong>{card.overall_grade ? ` (${card.overall_grade})` : ""} · CGPA {value(card.cgpa)} · Credits {value(card.credits_earned)}/{value(card.credits_attempted)} · Attendance {value(card.attendance_pct, "%")}</p>
        <div className="report-course-list">{rows.map(({ course, breakdown }) => <details key={course.course} className="report-course">
          <summary><span className="report-course-name">{course.course}{course.failed ? <small> · not passed</small> : null}</span><span>{value(course.percentage, "%")}</span><strong>{course.grade || breakdown?.grade || "—"}</strong><span>GPA {value(course.gpa)}</span><span>{value(course.credits)} cr</span></summary>
          {breakdown ? <>
            <table className="criteria-table"><thead><tr><th>Component</th><th>Weight</th><th>Marks</th><th>Of</th><th>Points toward total</th></tr></thead>
              <tbody>{breakdown.components.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.weightPct}%</td><td>{item.marks}</td><td>{item.max}</td><td>{item.max > 0 ? (Math.round(item.weightPct * item.marks / item.max * 100) / 100) : "—"} / {item.weightPct}</td></tr>)}
                <tr className="report-total"><td>Cumulative · Grade {breakdown.grade}</td><td>100%</td><td colSpan={2}>{value(breakdown.cumulative)} / 100</td><td>{breakdown.computed} / 100</td></tr></tbody></table>
            {breakdown.agrees === false && <p className="form-error">The printed total ({breakdown.cumulative}) does not follow from these components ({breakdown.computed}). Check the grade report with the course office; this page shows both and corrects neither.</p>}
          </> : <p className="scope-note">No component breakdown yet. Import the grade report PDF to see weights and marks.</p>}
        </details>)}</div>
        {(card.out_class ?? []).length > 0 && <p className="report-card-summary">Out of class: {card.out_class.map((item) => `${item.name} — ${value(item.score)}${item.outOf ? `/${item.outOf}` : ""}${item.grade ? `, grade ${item.grade}` : ""}${item.credits !== null ? `, ${item.credits} credits` : ""}`).join(" · ")}</p>}
        <small className="scope-note">Totals read {shortDate(card.fetched_at)} by the daily sync.{card.breakdown_imported_at ? ` Breakdown from the grade report${card.breakdown_generated_on ? ` generated ${card.breakdown_generated_on}` : ""}, imported ${shortDate(card.breakdown_imported_at)}.` : " No grade report PDF imported yet."}</small>
      </article>;
    })}
  </section>;
}
