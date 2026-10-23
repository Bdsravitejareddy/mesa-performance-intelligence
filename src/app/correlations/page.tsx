import type { SupabaseClient } from "@supabase/supabase-js";
import { AppShell } from "@/components/app-shell";
import { Why } from "@/components/why";
import { cachedRead } from "@/lib/data/cached";
import { STAKES_LABEL, stakesOf, type Stakes } from "@/lib/assessments/stakes";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type Point = { title: string; course: string; official: number | null; ai: number | null; code: number | null; late: boolean | null; group: boolean | null; month: string | null; stakes: Stakes; term: string | null; week: string | null };
type Pattern = { key: string; title: string; reading: string; n: number; detail: { label: string; value: string; n: number }[]; caution: string };

const mean = (values: number[]) => (values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null);
function pearson(pairs: [number, number][]) {
  if (pairs.length < 3) return null;
  const mx = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const my = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  const cov = pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  const sx = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - mx) ** 2, 0));
  const sy = Math.sqrt(pairs.reduce((sum, [, y]) => sum + (y - my) ** 2, 0));
  return sx && sy ? Math.round((cov / (sx * sy)) * 100) / 100 : null;
}
const strength = (r: number) => (Math.abs(r) >= 0.7 ? "strong" : Math.abs(r) >= 0.4 ? "moderate" : Math.abs(r) >= 0.2 ? "weak" : "no clear");

// Descriptive patterns only: each states its sample size, and none implies a cause.
function patterns(points: Point[]): Pattern[] {
  const out: Pattern[] = [];
  // Quality by how much the work counted: blind AI grades (same grader for all), and how complete the work was.
  const tiers = (["exam", "graded", "practice"] as Stakes[]).map((stakes) => { const rows = points.filter((point) => point.stakes === stakes); return { stakes, ai: mean(rows.filter((point) => point.ai !== null).map((point) => point.ai!)), code: mean(rows.filter((point) => point.code !== null).map((point) => point.code!)), n: rows.filter((point) => point.ai !== null).length }; }).filter((tier) => tier.n > 0);
  const exam = tiers.find((tier) => tier.stakes === "exam"), practice = tiers.find((tier) => tier.stakes === "practice");
  out.push({ key: "stakes", title: "Term exams vs practice work", n: tiers.reduce((sum, tier) => sum + tier.n, 0),
    reading: exam?.ai != null && practice?.ai != null ? `The blind grader scores your term exams ${exam.ai} on average (${exam.n}) and your practice work ${practice.ai} (${practice.n}) — ${Math.abs(Math.round((exam.ai - practice.ai) * 10) / 10)} points ${exam.ai >= practice.ai ? "higher on exams" : "higher on practice"}.${exam.code != null && practice.code != null ? ` Completeness: ${exam.code} vs ${practice.code}.` : ""} Practice work is weighted lightly elsewhere for this reason.` : "Needs AI grades on both term exams and practice work to compare.",
    detail: tiers.map((tier) => ({ label: `${STAKES_LABEL[tier.stakes]} · AI`, value: tier.ai?.toString() ?? "—", n: tier.n })), caution: "Exams and practice tasks differ in difficulty and format as well as effort, so the gap mixes all three. One grader is used for both, which keeps the comparison like for like." });
  const both = points.filter((point) => point.official !== null && point.ai !== null);
  const gaps = both.map((point) => point.ai! - point.official!);
  out.push({ key: "ai-official", title: "AI grade vs official mark", n: both.length,
    reading: both.length ? `Across ${both.length} assessment${both.length === 1 ? "" : "s"} with both, the AI lands on average ${Math.abs(mean(gaps)!)} points ${mean(gaps)! >= 0 ? "above" : "below"} the official mark.` : "No assessment has both an official mark and an AI grade yet.",
    detail: both.map((point) => ({ label: point.title, value: `official ${point.official} · AI ${point.ai}`, n: 1 })), caution: "The AI grades blind against the brief; official marks can include criteria, weights and penalties it does not see." });
  const completeness = points.filter((point) => point.code !== null && point.ai !== null).map((point) => [point.code!, point.ai!] as [number, number]);
  const r = pearson(completeness);
  out.push({ key: "completeness", title: "Completeness vs AI grade", n: completeness.length,
    reading: r === null ? `Needs at least 3 graded submissions (${completeness.length} so far).` : `A ${strength(r)} relationship (r = ${r}) across ${completeness.length} submissions: ${r >= 0.4 ? "work that answers more of the brief tends to be graded higher." : r <= -0.4 ? "more complete work was not graded higher here." : "completeness and quality vary independently in your work."}`,
    detail: [], caution: "A correlation across a handful of submissions is a pattern to watch, not a conclusion." });
  const timed = points.filter((point) => point.late !== null && (point.official ?? point.ai) !== null);
  const late = timed.filter((point) => point.late).map((point) => (point.official ?? point.ai)!);
  const onTime = timed.filter((point) => !point.late).map((point) => (point.official ?? point.ai)!);
  out.push({ key: "timing", title: "On time vs late", n: timed.length,
    reading: late.length && onTime.length ? `Late work averages ${mean(late)} (${late.length}) against ${mean(onTime)} on time (${onTime.length}).` : late.length ? `Only late submissions have results so far (${late.length}).` : `${onTime.length} on-time submission${onTime.length === 1 ? " has" : "s have"} results; none was late.`,
    detail: [{ label: "On time", value: mean(onTime)?.toString() ?? "—", n: onTime.length }, { label: "Late", value: mean(late)?.toString() ?? "—", n: late.length }], caution: "Uses the official mark where released, otherwise the AI grade. Late penalties, if any, are part of official marks." });
  // Like for like: the same blind grader, compared within each stakes tier, so individual practice tasks are
  // never set against group term exams.
  const tierRows = (["exam", "graded", "practice"] as Stakes[]).map((stakes) => {
    const rows = points.filter((point) => point.stakes === stakes && point.group !== null && point.ai !== null);
    const group = rows.filter((point) => point.group).map((point) => point.ai!), solo = rows.filter((point) => !point.group).map((point) => point.ai!);
    return { stakes, group: mean(group), solo: mean(solo), groupN: group.length, soloN: solo.length };
  });
  const comparable = tierRows.filter((tier) => tier.groupN && tier.soloN);
  out.push({ key: "group", title: "Group vs individual work (like for like)", n: tierRows.reduce((sum, tier) => sum + tier.groupN + tier.soloN, 0),
    reading: comparable.length ? comparable.map((tier) => `${STAKES_LABEL[tier.stakes]}: group ${tier.group} (${tier.groupN}) vs individual ${tier.solo} (${tier.soloN})`).join("; ") + "." : `Not comparable yet: no tier has both group and individual work with AI grades (${tierRows.map((tier) => `${STAKES_LABEL[tier.stakes].toLowerCase()} ${tier.groupN} group / ${tier.soloN} individual`).join(", ")}).`,
    detail: comparable.flatMap((tier) => [{ label: `${STAKES_LABEL[tier.stakes]} · group`, value: tier.group!.toString(), n: tier.groupN }, { label: `${STAKES_LABEL[tier.stakes]} · individual`, value: tier.solo!.toString(), n: tier.soloN }]),
    caution: "Compared only within the same tier and grader. Group results reflect the whole team's work, and tiers still differ in task and difficulty." });
  // Over time, at the right grain: course work (term exams and graded work) by term, practice and quizzes by
  // week. Kinds are never mixed. Official marks where released, otherwise the blind AI grade.
  const termOrder = (term: string) => (term === "Pre-Term" ? 0 : term === "Term 1" ? 1 : term === "Term 2" ? 2 : 3);
  const byTerm = (["exam", "graded"] as Stakes[]).map((stakes) => {
    const rows = points.filter((point) => point.stakes === stakes && point.term && (point.official ?? point.ai) !== null);
    const terms = [...new Set(rows.map((point) => point.term!))].sort((a, b) => termOrder(a) - termOrder(b));
    return { stakes, periods: terms.map((term) => { const values = rows.filter((point) => point.term === term).map((point) => (point.official ?? point.ai)!); return { label: term, value: mean(values)!, n: values.length }; }) };
  }).filter((row) => row.periods.length);
  const practiceRows = points.filter((point) => (point.stakes === "practice" || /quiz/i.test(point.title)) && point.week && (point.official ?? point.ai) !== null);
  const weeks = [...new Set(practiceRows.map((point) => point.week!))].sort();
  const byWeek = weeks.map((week) => { const values = practiceRows.filter((point) => point.week === week).map((point) => (point.official ?? point.ai)!); return { label: `w/c ${new Date(week).toLocaleDateString("en", { day: "numeric", month: "short" })}`, value: mean(values)!, n: values.length }; });
  const termReading = byTerm.map((row) => row.periods.length >= 2 ? `${STAKES_LABEL[row.stakes]}: ${row.periods.map((period) => `${period.label} ${period.value} (${period.n})`).join(" → ")}` : `${STAKES_LABEL[row.stakes]}: ${row.periods[0].label} only, ${row.periods[0].value} (${row.periods[0].n})`).join("; ");
  out.push({ key: "trend-term", title: "Course work by term", n: byTerm.reduce((sum, row) => sum + row.periods.reduce((total, period) => total + period.n, 0), 0),
    reading: byTerm.length ? `${termReading}. A comparison needs results from at least two terms.` : "No term exams or graded work with results yet.",
    detail: byTerm.flatMap((row) => row.periods.map((period) => ({ label: `${STAKES_LABEL[row.stakes]} · ${period.label}`, value: period.value.toString(), n: period.n }))), caution: "Terms contain different courses, so a change between terms mixes subject and difficulty with growth; read it as a change in average evaluated results." });
  out.push({ key: "trend-week", title: "Practice and quizzes by week", n: byWeek.reduce((sum, row) => sum + row.n, 0),
    reading: byWeek.length >= 2 ? `From ${byWeek[0].label} (${byWeek[0].value}, ${byWeek[0].n}) to ${byWeek.at(-1)!.label} (${byWeek.at(-1)!.value}, ${byWeek.at(-1)!.n}) across ${byWeek.length} weeks.` : "Needs practice or quiz results from at least two weeks with known dates.",
    detail: byWeek.map((row) => ({ ...row, value: row.value.toString() })), caution: "Each week's tasks differ; practice is ungraded and usually gets less effort than exams." });
  return out;
}

export default async function PatternsPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const points = demoMode || !hasSupabaseConfig() ? [] : await cachedRead("patterns", load);
  const rows = patterns(points);
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Performance patterns</div><h1>Patterns</h1><p className="page-subtitle">What moves together in your results: descriptive patterns with their sample sizes, never causes.</p></div></div>
    <div className="pattern-grid">{rows.map((row) => <article key={row.key} className="content-panel pattern-card">
      <header><h2>{row.title}</h2><span className="panel-count">n = {row.n}</span></header>
      <p className="pattern-reading">{row.reading}</p>
      {row.detail.length > 0 && <div className="pattern-bars">{row.detail.map((item) => { const value = Number.parseFloat(item.value); return <div key={item.label} className="pattern-bar"><span>{item.label}</span><i><b style={{ width: `${Number.isFinite(value) ? Math.min(100, value) : 0}%` }} /></i><em>{item.value}</em></div>; })}</div>}
      <Why label="Caution">{row.caution}</Why>
    </article>)}</div>
  </div></AppShell>;
}

async function load(supabase: SupabaseClient): Promise<Point[]> {
  const [assessments, courses, submissions, gradings] = await Promise.all([
    supabase.from("assessments").select("id, course_id, title"),
    supabase.from("courses").select("id, title, term"),
    supabase.from("submissions").select("assessment_id, official_mark, page_capture, submitted_at"),
    supabase.from("submission_gradings").select("assessment_id, ai_score, code_score, created_at").order("created_at", { ascending: false }),
  ]);
  const course = new Map((courses.data ?? []).map((row) => [row.id as string, (row.title as string).replace(/\s+with\s+.*$/i, "")]));
  const courseTerm = new Map((courses.data ?? []).map((row) => [row.id as string, (row.term as string | null) ?? null]));
  const latest = new Map<string, { ai: number | null; code: number | null }>();
  for (const row of gradings.data ?? []) if (!latest.has(row.assessment_id as string)) latest.set(row.assessment_id as string, { ai: row.ai_score === null ? null : Number(row.ai_score), code: row.code_score === null ? null : Number(row.code_score) });
  return (assessments.data ?? []).map((assessment) => {
    const sub = (submissions.data ?? []).find((row) => row.assessment_id === assessment.id);
    const capture = (sub?.page_capture ?? null) as { timing?: string | null; isGroup?: boolean; submittedAt?: string | null } | null;
    const when = capture?.submittedAt ? new Date(capture.submittedAt.replace(/^[A-Za-z]+day,\s*/, "").replace(" ·", "")) : sub?.submitted_at ? new Date(sub.submitted_at as string) : null;
    const grade = latest.get(assessment.id as string);
    return {
      title: assessment.title as string, course: course.get(assessment.course_id as string) ?? "",
      official: sub?.official_mark === null || sub?.official_mark === undefined ? null : Number(sub.official_mark),
      ai: grade?.ai ?? null, code: grade?.code ?? null,
      late: capture?.timing ? capture.timing === "late" : null, group: capture ? capture.isGroup === true : null, stakes: stakesOf(assessment.title as string),
      term: courseTerm.get(assessment.course_id as string) ?? null,
      week: when && !Number.isNaN(when.getTime()) ? new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate() - ((when.getUTCDay() + 6) % 7))).toISOString().slice(0, 10) : null,
      month: when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString("en", { month: "short", year: "numeric" }) : null,
    };
  }).filter((point) => point.official !== null || point.ai !== null || point.code !== null);
}
