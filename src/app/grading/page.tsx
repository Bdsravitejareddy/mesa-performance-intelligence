import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppShell } from "@/components/app-shell";
import { RunGrading } from "@/components/run-grading";
import { DetachFile } from "@/components/detach-file";
import { calibrate, corrected, MIN_PAIRS } from "@/lib/grading/calibration";
import { Cue } from "@/components/cue";
import { Why } from "@/components/why";
import { cachedRead } from "@/lib/data/cached";
import { inTerm, selectedTerm, type TermChoice } from "@/lib/term";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { CodeReport } from "@/lib/grading/code-score";
import type { Comparison } from "@/lib/grading/compare";
import type { BlindReport } from "@/lib/quality/engine";
import { reviewCase, REVIEW_GAP, type ReviewCase } from "@/lib/grading/review-case";

export const dynamic = "force-dynamic";

type Grading = { id: string; submission_id: string; assessment_id: string; standard_source: string; standard_label: string; code_score: number | null; code_report: CodeReport; ai_score: number | null; ai_report: BlindReport | null; ai_status: string; official_mark: number | null; comparison: Comparison; provider_model: string; created_at: string };
type Row = Grading & { assessment: string; course: string; feedback: string; review: ReviewCase | null; files: { id: string; name: string }[] };
type Waiting = { assessment: string; course: string; reason: string };

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const fmt = (value: number | null) => (value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1));
const SOURCE_LABEL: Record<string, string> = { official_rubric: "Official rubric", approved_rubric: "Approved rubric", assignment_brief_inferred: "Criteria drawn from the assignment brief (AI-derived, not an official rubric)", course_objectives_inferred: "Provisional criteria from course material" };

export default async function GradingPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const term = await selectedTerm();
  const data = demoMode || !hasSupabaseConfig() ? null : await cachedRead(`grading:${term}`, (client) => loadGrading(client, term));
  const rows = data?.rows ?? [];
  const withOfficial = rows.filter((row) => row.official_mark !== null && row.ai_score !== null);
  const meanGap = withOfficial.length ? withOfficial.reduce((sum, row) => sum + Math.abs(row.ai_score! - row.official_mark!), 0) / withOfficial.length : null;
  const close = withOfficial.filter((row) => Math.abs(row.ai_score! - row.official_mark!) <= 7.5).length;
  const facultyPoints = rows.reduce((sum, row) => sum + (row.comparison?.agreed?.length ?? 0) + (row.comparison?.facultyOnly?.length ?? 0), 0);
  const agreedPoints = rows.reduce((sum, row) => sum + (row.comparison?.agreed?.length ?? 0), 0);
  const calibration = calibrate(rows.map((row) => ({ official: row.official_mark, ai: row.ai_score })));
  const reviews = rows.filter((row) => row.review).sort((a, b) => (a.review!.strength === b.review!.strength ? b.review!.gap - a.review!.gap : a.review!.strength === "strong" ? -1 : 1));

  const headline = !rows.length
    ? "Nothing has been graded yet."
    : withOfficial.length
      ? `The AI lands within 7.5 points of your faculty on ${close} of ${withOfficial.length} marked submission${withOfficial.length === 1 ? "" : "s"}.`
      : `${rows.length} submission${rows.length === 1 ? "" : "s"} graded; none has an official mark to compare with yet.`;

  return <AppShell demoMode={demoMode}><div className="section-page grading-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Graded against your course content</div><h1>Graded work</h1><p className="page-subtitle">{headline}</p></div>{data && !data.missing && <RunGrading />}</div>

    {data?.missing && <p className="info-callout">Grading storage is not set up yet. Apply the submission-gradings migration, then grade.</p>}

    {data && !data.missing && <section className="stat-strip" aria-label="Grading summary">
      <Stat value={`${rows.length}`} unit={`of ${data.assessmentCount}`} label="Assessments with a graded file" />
      <Stat value={meanGap === null ? "—" : fmt(Math.round(meanGap * 10) / 10)} unit="pts" label="Typical AI vs official gap" />
      <Stat value={facultyPoints ? `${Math.round((agreedPoints / facultyPoints) * 100)}` : "—"} unit={facultyPoints ? "%" : ""} label="Faculty points the AI also raised" />
      <Stat value={`${data.waiting.length}`} unit="" label="Not graded — no file found" />
    </section>}

    {data && !data.missing && <section className="content-panel calibration" aria-label="How far to trust AI grades">
      <h2>How far to trust AI grades</h2>
      {calibration.pairs ? <p>Across the <b>{calibration.pairs}</b> submission{calibration.pairs === 1 ? "" : "s"} with both an official mark and a blind AI grade, the AI sits on average <b>{Math.abs(calibration.bias!)} points {calibration.bias! >= 0 ? "above" : "below"}</b> your faculty, typically {calibration.mae} points away, and within 7.5 points on {calibration.within} of {calibration.pairs}.</p> : <p>No submission has both an official mark and an AI grade yet, so the AI cannot be checked against your faculty.</p>}
      <p className="empty-hint">{calibration.ready ? "Each AI grade below also shows a corrected estimate — the AI grade adjusted for this bias, with the typical error as its range. Official marks always take precedence." : `With fewer than ${MIN_PAIRS} marked pairs this is too little to correct for, so AI grades are shown as they are. Read them as a second opinion on the brief, not a predicted mark; the gap usually comes from criteria, weights or penalties the AI cannot see.`}</p>
    </section>}

    {reviews.length > 0 && <section className="content-panel review-cases" aria-label="Where a higher mark may be justified">
      <h2>Where a higher mark may be justified <span className="panel-count">{reviews.length}</span></h2>
      <p className="empty-hint">The blind AI grade is at least {REVIEW_GAP} points above the official mark and rests on quotes verified in your own work. This is a case to discuss, not proof the mark is wrong — the counterpoints are listed with it.</p>
      {reviews.map((row) => <ReviewCard key={row.id} row={row} />)}
    </section>}

    {rows.length > 0 && <section className="grade-list" aria-label="Graded submissions">
      <div className="grade-legend"><span><i className="mark-official" /> <Cue label="Official" /></span><span><i className="mark-ai" /> <Cue label="AI">AI (blind)</Cue></span><span><i className="mark-code" /> <Cue label="Code">Code check (completeness)</Cue></span></div>
      {rows.map((row) => <article key={row.id} className="content-panel grade-row">
        <header className="grade-row-head">
          <div><h2>{row.assessment}</h2><small>{row.course}</small></div>
          <span className="grade-badges">{row.review && <span className={`agreement review-badge review-${row.review.strength}`}>Case for +{fmt(row.review.gap)}</span>}<span className={`agreement agreement-${row.comparison?.agreement ?? "no_official_mark"}`}>{agreementLabel(row.comparison?.agreement)}</span></span>
        </header>
        {row.comparison?.mismatch && <div className="mismatch-callout"><p><b>This file may not be the submission for this assessment.</b> {row.comparison.mismatch} It was not scored.</p>{row.files.map((file) => <DetachFile key={file.id} submissionId={row.submission_id} documentId={file.id} name={file.name} />)}</div>}
        <ScoreTrack official={row.official_mark} ai={row.ai_score} code={row.code_score} />
        <div className="grade-figures">
          <Figure label="Official" value={row.official_mark} />
          <Figure label="AI" value={row.ai_score} note={row.ai_status !== "complete" ? (row.ai_status === "skipped" ? "not run" : "retrying") : (() => { const estimate = row.official_mark === null ? corrected(row.ai_score, calibration) : null; return estimate ? `corrected ${estimate.low}–${estimate.high}` : undefined; })()} />
          <Figure label="Code" value={row.code_score} note={row.code_report?.completeness !== undefined && row.code_report?.completeness !== null ? `${row.code_report.parts?.filter((part) => part.answered).length}/${row.code_report.parts?.length} parts` : row.code_score === null ? "nothing to tick off" : undefined} />
        </div>
        {row.comparison && (row.comparison.agreed.length > 0 || row.comparison.facultyOnly.length > 0) && <p className="grade-insight">{insightLine(row.comparison)}</p>}
        {row.comparison?.documents && row.comparison.documents.length > 1 && <div className="doc-scores">{row.comparison.documents.map((doc) => <span key={doc.name}><strong>{doc.name}</strong> code {fmt(doc.code)}{doc.ai !== null ? ` · AI ${fmt(doc.ai)}` : ""}</span>)}</div>}
        {row.comparison?.reasons && row.comparison.reasons.length > 0 && <Why label="Why the scores differ"><ul className="reason-list">{row.comparison.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></Why>}
        <Why label="See the reasoning">
          <p className="scope-note">{SOURCE_LABEL[row.standard_source] ?? row.standard_source}. {row.comparison?.note}</p>
          {row.code_report?.parts && row.code_report.parts.length > 0 && <table className="criteria-table"><thead><tr><th>Part of the brief</th><th>Answered?</th></tr></thead><tbody>{row.code_report.parts.map((part) => <tr key={part.label}><td><b>{part.label}</b> {part.text.slice(0, 120)}</td><td>{part.how === "label" ? "Yes — labelled" : part.how === "formula" ? "Yes — formulas used" : part.how === "keywords" ? "Yes — by content" : "Not found"}</td></tr>)}</tbody></table>}
          <table className="criteria-table"><thead><tr><th>Criterion</th><th>AI /10</th><th>Code /10</th><th>Terms found</th></tr></thead><tbody>
            {(row.code_report?.criteria ?? []).map((criterion) => {
              const dimension = row.ai_report?.dimensions.find((item) => item.name === criterion.name);
              return <tr key={criterion.name}><td>{criterion.name}{dimension?.issue && <small>{dimension.issue}</small>}</td><td>{fmt(dimension?.score ?? null)}</td><td>{fmt(criterion.score)}</td><td><small>{criterion.matched.length} of {criterion.expected.length}{criterion.expected.length - criterion.matched.length > 0 && ` · missing ${criterion.expected.filter((term) => !criterion.matched.includes(term)).slice(0, 4).join(", ")}`}</small></td></tr>;
            })}
          </tbody></table>
          <div className="grade-compare">
            <div><h3>Faculty and AI agree</h3>{row.comparison?.agreed.length ? <ul>{row.comparison.agreed.map((item) => <li key={item.feedback}><q>{item.feedback}</q><small>AI: {item.ai}</small></li>)}</ul> : <p className="empty-hint">{row.feedback ? "No shared points." : "No faculty feedback recorded."}</p>}</div>
            <div><h3>Only the faculty raised</h3>{row.comparison?.facultyOnly.length ? <ul>{row.comparison.facultyOnly.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-hint">—</p>}</div>
            <div><h3>Only the AI raised</h3>{row.comparison?.aiOnly.length ? <ul>{row.comparison.aiOnly.slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-hint">—</p>}</div>
          </div>
          <p className="scope-note">{row.code_report?.method} {row.code_report?.adjustments?.join("; ")} The AI graded blind: it never saw the official mark or feedback. {row.ai_report?.label} Graded {new Date(row.created_at).toLocaleString()}{row.provider_model ? ` · ${row.provider_model}` : ""}.</p>
        </Why>
      </article>)}
    </section>}

    {data && !data.missing && data.waiting.length > 0 && <section className="content-panel">
      <h2>Not graded — no file found <span className="panel-count">{data.waiting.length}</span></h2>
      <p className="empty-hint">No submitted file has been found for these, so there is nothing to grade — this includes exams marked on the platform only, and work submitted through a form. They can be graded once a file is found in the course's Drive folder. Matching runs every night, or from <Link href="/materials/review">Material review</Link>.</p>
      <Why label={`Show all ${data.waiting.length}`}><ul className="waiting-list">{data.waiting.map((item) => <li key={`${item.course}-${item.assessment}`}><strong>{item.assessment}</strong><small>{item.course} · {item.reason}</small></li>)}</ul></Why>
    </section>}
  </div></AppShell>;
}

function ReviewCard({ row }: { row: Row }) {
  const review = row.review!;
  return <article className={`review-card review-${review.strength}`}>
    <header><div><h3>{row.assessment}</h3><small>{row.course}</small></div><div className="review-figures"><span>Official <b>{fmt(row.official_mark)}</b></span><span>AI <b>{fmt(row.ai_score)}</b></span><em>{review.strength === "strong" ? "Strong case" : "Worth asking"} · +{fmt(review.gap)}</em></div></header>
    <ul className="review-points">{review.points.slice(0, 4).map((point) => <li key={point.criterion}><strong>{point.criterion} <span>{fmt(point.score)}/10</span></strong><q>{point.quote}</q>{point.strength && <small>{point.strength}</small>}</li>)}</ul>
    {review.corroboration.length > 0 && <p className="scope-note">{review.corroboration.join(" ")}</p>}
    <Why label={`What could explain the official mark (${review.counterpoints.length})`}><ul className="reason-list">{review.counterpoints.map((point) => <li key={point}>{point}</li>)}</ul></Why>
    <Why label="A question you could ask"><p className="review-question">{review.question}</p></Why>
  </article>;
}

function agreementLabel(value: Comparison["agreement"] | undefined) {
  return value === "close" ? "AI close to official" : value === "moderate" ? "Moderate gap" : value === "far" ? "Large gap" : "No official mark";
}

function insightLine(comparison: Comparison) {
  const total = comparison.agreed.length + comparison.facultyOnly.length;
  return `The AI independently raised ${comparison.agreed.length} of the faculty's ${total} point${total === 1 ? "" : "s"}${comparison.aiOnly.length ? `, and ${comparison.aiOnly.length} the faculty did not mention` : ""}.`;
}

function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return <div className="stat"><strong>{value}<small>{unit}</small></strong><span>{label}</span></div>;
}

function Figure({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return <div className={`grade-figure figure-${label.toLowerCase()}`}><span><Cue label={label} /></span><strong>{fmt(value)}</strong><small>{note ?? (value === null ? "none" : "/100")}</small></div>;
}

function ScoreTrack({ official, ai, code }: { official: number | null; ai: number | null; code: number | null }) {
  const marker = (value: number | null, kind: string) => value === null ? null : <i className={`track-mark mark-${kind}`} style={{ left: `${Math.max(0, Math.min(100, value))}%` }} title={`${kind}: ${fmt(value)}`} />;
  const values = [official, ai, code].filter((value): value is number => value !== null);
  const span = values.length > 1 ? { left: `${Math.min(...values)}%`, width: `${Math.max(...values) - Math.min(...values)}%` } : null;
  return <div className="score-track" aria-hidden="true">{span && <span className="track-span" style={span} />}{marker(code, "code")}{marker(ai, "ai")}{marker(official, "official")}</div>;
}

async function loadGrading(supabase: SupabaseClient, term: TermChoice) {
  const [gradings, submissions, assessments, courses, documents] = await Promise.all([
    supabase.from("submission_gradings").select("id, submission_id, assessment_id, standard_source, standard_label, code_score, code_report, ai_score, ai_report, ai_status, official_mark, comparison, provider_model, created_at").order("created_at", { ascending: false }),
    supabase.from("submissions").select("id, assessment_id, official_feedback, page_capture"),
    supabase.from("assessments").select("id, course_id, title").order("title"),
    supabase.from("courses").select("id, title, term"),
    supabase.from("submission_documents").select("id, name, submission_id, extraction_status"),
  ]);
  if (gradings.error) return { missing: true as const, rows: [] as Row[], waiting: [] as Waiting[], assessmentCount: 0 };
  const course = new Map((courses.data ?? []).map((row) => [row.id as string, row.title as string]));
  const termCourses = new Set((courses.data ?? []).filter((row) => inTerm(term, row.term as string | null)).map((row) => row.id as string));
  assessments.data = (assessments.data ?? []).filter((row) => termCourses.has(row.course_id as string));
  const assessment = new Map((assessments.data ?? []).map((row) => [row.id as string, { title: row.title as string, course: course.get(row.course_id as string) ?? "" }]));
  const feedback = new Map((submissions.data ?? []).map((row) => [row.id as string, (row.official_feedback as string) ?? ""]));
  const lateness = new Map((submissions.data ?? []).map((row) => { const timing = (row.page_capture as { timing?: string | null } | null)?.timing; return [row.id as string, timing ? timing === "late" : null]; }));
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const raw of gradings.data ?? []) {
    if (seen.has(raw.submission_id as string)) continue;
    seen.add(raw.submission_id as string);
    const meta = assessment.get(raw.assessment_id as string);
    if (!meta) continue;
    const grading = { ...(raw as unknown as Grading), code_score: num(raw.code_score), ai_score: num(raw.ai_score), official_mark: num(raw.official_mark) };
    const review = grading.ai_status === "complete" ? reviewCase({ official: grading.official_mark, ai: grading.ai_score, code: grading.code_score, report: grading.ai_report, codeReport: grading.code_report, comparison: grading.comparison, standardSource: grading.standard_source, late: lateness.get(grading.submission_id) ?? null, assessment: meta.title }) : null;
    rows.push({ ...grading, assessment: meta.title, course: meta.course, feedback: feedback.get(raw.submission_id as string) ?? "", review, files: (documents.data ?? []).filter((doc) => doc.submission_id === raw.submission_id).map((doc) => ({ id: doc.id as string, name: doc.name as string })) });
  }
  const gradedAssessments = new Set(rows.map((row) => row.assessment_id));
  const submissionsByAssessment = new Map<string, string[]>();
  for (const row of submissions.data ?? []) submissionsByAssessment.set(row.assessment_id as string, [...(submissionsByAssessment.get(row.assessment_id as string) ?? []), row.id as string]);
  const docStatus = new Map<string, string[]>();
  for (const row of documents.data ?? []) docStatus.set(row.submission_id as string, [...(docStatus.get(row.submission_id as string) ?? []), row.extraction_status as string]);
  const waiting: Waiting[] = (assessments.data ?? []).filter((row) => !gradedAssessments.has(row.id as string)).map((row) => {
    const subs = submissionsByAssessment.get(row.id as string) ?? [];
    const statuses = subs.flatMap((id) => docStatus.get(id) ?? []);
    const reason = !statuses.length ? (subs.length ? "mark recorded, but no submitted file found yet" : "no submitted file found yet") : statuses.some((status) => status !== "complete") ? "submitted file still being read" : "ready — grades on the next run";
    return { assessment: row.title as string, course: course.get(row.course_id as string) ?? "", reason };
  });
  rows.sort((a, b) => a.course.localeCompare(b.course) || a.assessment.localeCompare(b.assessment));
  return { missing: false as const, rows, waiting, assessmentCount: (assessments.data ?? []).length };
}
