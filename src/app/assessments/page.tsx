import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppShell } from "@/components/app-shell";
import { Why } from "@/components/why";
import { cachedRead } from "@/lib/data/cached";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { inTerm, selectedTerm, type TermChoice } from "@/lib/term";
import { markLoss, type MarkLoss } from "@/lib/grading/mark-loss";
import type { BlindReport } from "@/lib/quality/engine";
import type { CodeReport } from "@/lib/grading/code-score";

export const dynamic = "force-dynamic";

type Status = "marked" | "graded" | "submitted" | "external" | "not_submitted";
type Row = { id: string; title: string; course: string; status: Status; official: number | null; ai: number | null; code: number | null; files: number; links: number; linksImported: number; submittedAt: string | null; timing: string | null; group: boolean; feedback: boolean; loss: MarkLoss | null };

const STATUS: Record<Status, string> = { marked: "Marked", graded: "Graded by AI", submitted: "Submitted", external: "Submitted via form", not_submitted: "Not submitted" };
const fmt = (value: number | null) => (value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1));
const shortCourse = (name: string) => name.replace(/\s+with\s+.*$/i, "");

// One register for every assessment: what was submitted, how it was graded and what the official mark is.
export default async function AssessmentsPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const term = await selectedTerm();
  const rows = demoMode || !hasSupabaseConfig() ? [] : await cachedRead(`assessments:${term}`, (client) => load(client, term));
  const losses = rows.filter((row) => row.loss && row.loss.lost >= 5).sort((a, b) => b.loss!.lost - a.loss!.lost);
  const count = (status: Status) => rows.filter((row) => row.status === status).length;
  const byCourse = [...new Set(rows.map((row) => row.course))];
  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Every assessment</div><h1>Assessments</h1><p className="page-subtitle">{rows.length ? `${count("marked")} marked · ${count("graded")} graded by AI only · ${count("submitted") + count("external")} submitted, awaiting a grade · ${count("not_submitted")} not submitted` : "No assessments in this term yet."}</p></div></div>
    {losses.length > 0 && <section className="content-panel loss-panel" aria-label="Where the marks went">
      <h2>Where the marks went <span className="panel-count">{losses.length}</span></h2>
      <p className="empty-hint">For each marked assessment: how many of the 100 marks were lost, which criteria they went on, and what that means. Faculty breakdowns are used where the feedback gives one; otherwise the split is estimated from the blind AI grade and labelled so.</p>
      <div className="loss-grid">{losses.map((row) => <LossCard key={row.id} row={row} />)}</div>
    </section>}
    {byCourse.map((course) => <section key={course} className="content-panel register-course">
      <h2>{shortCourse(course)} <span className="panel-count">{rows.filter((row) => row.course === course).length}</span></h2>
      <div className="register-table" role="table">
        <div className="register-head" role="row"><span>Assessment</span><span>Status</span><span>Official</span><span>AI</span><span>Code</span></div>
        {rows.filter((row) => row.course === course).map((row) => <Link key={row.id} href={row.ai !== null || row.code !== null ? "/grading" : "/marks"} className={`register-row status-${row.status}`} role="row">
          <span className="register-title"><strong>{row.title}</strong><small>{[row.submittedAt && `submitted ${row.submittedAt}${row.timing === "late" ? " (late)" : ""}`, row.group && "group", row.files && `${row.files} file${row.files === 1 ? "" : "s"}`, row.links && `${row.links} link${row.links === 1 ? "" : "s"}${row.linksImported < row.links ? ` (${row.links - row.linksImported} importing)` : ""}`, row.feedback && "feedback"].filter(Boolean).join(" · ") || "no submission recorded"}</small></span>
          <span><em className={`status-chip chip-${row.status}`}>{STATUS[row.status]}</em></span>
          <span className="register-score">{fmt(row.official)}</span>
          <span className="register-score">{fmt(row.ai)}</span>
          <span className="register-score muted">{fmt(row.code)}</span>
        </Link>)}
      </div>
    </section>)}
    {rows.length > 0 && <Why label="How these are worked out">Official marks come from the LMS. “AI” is a blind grade against the assignment brief and course material, and never sees the official mark. “Code” is a deterministic completeness check: the share of the brief&apos;s questions and parts your work answers. Submissions arrive from Nexus pages and your Drive (linked Sheets and Docs are fetched by the Drive connector), then are graded nightly.</Why>}
  </div></AppShell>;
}

const SOURCE_NOTE = { faculty_breakdown: "Split by the faculty's own criterion scores", ai_estimate: "Split estimated from the blind AI grade — no faculty breakdown was given" } as const;

function LossCard({ row }: { row: Row }) {
  const loss = row.loss!;
  const top = Math.max(...loss.items.map((item) => item.lost), 1);
  return <article className="loss-card">
    <header><div><h3>{shortCourse(row.course)}</h3><small>{row.title}</small></div><div className="loss-figure"><strong>−{fmt(loss.lost)}</strong><small>{fmt(loss.official)}/100</small></div></header>
    <p className="loss-reading">{loss.interpretation}</p>
    {loss.items.length > 0 && <ul className="loss-bars">{loss.items.map((item) => <li key={item.criterion}>
      <span className="loss-name">{item.criterion}{item.max !== undefined && <small> {fmt(item.got ?? null)}/{fmt(item.max)}</small>}</span>
      <i><b style={{ width: `${(item.lost / top) * 100}%` }} /></i><em>−{fmt(item.lost)}</em>
      {item.detail && <small className="loss-detail">{item.detail}</small>}
    </li>)}</ul>}
    <small className="scope-note">{loss.items.length ? SOURCE_NOTE[loss.source] : "No criterion-level evidence yet"}.{row.ai === null && loss.source === "ai_estimate" ? " Grading this submission will add the estimate." : ""}</small>
    {(loss.facultyComments.length > 0 || loss.missingParts.length > 0 || loss.aiView) && <Why label="Faculty comments and other evidence">
      {loss.aiView && <p>{loss.aiView}</p>}
      {loss.facultyComments.length > 0 && <><h4>Faculty said</h4><ul className="reason-list">{loss.facultyComments.map((comment) => <li key={comment}>{comment}</li>)}</ul></>}
      {loss.missingParts.length > 0 && <><h4>Parts of the brief the code check could not find</h4><ul className="reason-list">{loss.missingParts.map((part) => <li key={part}>{part}</li>)}</ul></>}
    </Why>}
  </article>;
}

async function load(supabase: SupabaseClient, term: TermChoice): Promise<Row[]> {
  const [assessments, courses, submissions, documents, links, gradings, sources] = await Promise.all([
    supabase.from("assessments").select("id, course_id, title, due_at").order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("courses").select("id, title, term"),
    supabase.from("submissions").select("id, assessment_id, official_mark, official_feedback, lms_submission_status, page_capture"),
    supabase.from("submission_documents").select("submission_id"),
    supabase.from("submission_links").select("submission_id, drive_file_id"),
    supabase.from("submission_gradings").select("assessment_id, ai_score, code_score, ai_report, code_report, created_at").order("created_at", { ascending: false }),
    supabase.from("drive_sources").select("drive_file_id").not("current_material_id", "is", null),
  ]);
  const course = new Map((courses.data ?? []).filter((row) => inTerm(term, row.term as string | null)).map((row) => [row.id as string, row.title as string]));
  const imported = new Set((sources.data ?? []).map((row) => row.drive_file_id as string));
  const latest = new Map<string, { ai: number | null; code: number | null; report: BlindReport | null; codeReport: CodeReport | null }>();
  for (const row of gradings.data ?? []) if (!latest.has(row.assessment_id as string)) latest.set(row.assessment_id as string, { ai: row.ai_score === null ? null : Number(row.ai_score), code: row.code_score === null ? null : Number(row.code_score), report: (row.ai_report ?? null) as BlindReport | null, codeReport: (row.code_report ?? null) as CodeReport | null });
  return (assessments.data ?? []).filter((row) => course.has(row.course_id as string)).map((assessment) => {
    const subs = (submissions.data ?? []).filter((row) => row.assessment_id === assessment.id);
    const ids = new Set(subs.map((row) => row.id as string));
    const official = subs.map((row) => row.official_mark).find((mark) => mark !== null);
    const capture = subs.map((row) => row.page_capture as { status?: string; submittedAt?: string; timing?: string; isGroup?: boolean } | null).find(Boolean) ?? null;
    const files = (documents.data ?? []).filter((row) => ids.has(row.submission_id as string)).length;
    const linkRows = (links.data ?? []).filter((row) => ids.has(row.submission_id as string));
    const grade = latest.get(assessment.id as string) ?? { ai: null, code: null, report: null, codeReport: null };
    const feedbackText = subs.map((row) => String(row.official_feedback ?? "")).find((text) => text.trim()) ?? "";
    const submittedStatus = subs.some((row) => /submit|graded/i.test(String(row.lms_submission_status ?? ""))) || /submitted/i.test(capture?.status ?? "");
    const status: Status = official !== undefined ? "marked" : grade.ai !== null ? "graded" : /external form/i.test(capture?.status ?? "") ? "external" : submittedStatus || files || linkRows.length ? "submitted" : "not_submitted";
    return {
      id: assessment.id as string, title: assessment.title as string, course: course.get(assessment.course_id as string)!, status,
      official: official === undefined ? null : Number(official), ai: grade.ai, code: grade.code, files, links: linkRows.length,
      linksImported: linkRows.filter((row) => row.drive_file_id && imported.has(row.drive_file_id as string)).length,
      submittedAt: capture?.submittedAt ? capture.submittedAt.replace(/^[A-Za-z]+day,\s*/, "").replace(/\s*·.*$/, "") : null,
      timing: capture?.timing ?? null, group: capture?.isGroup === true, feedback: feedbackText.length > 0,
      loss: official === undefined ? null : markLoss({ official: Number(official), feedback: feedbackText, report: grade.report, codeReport: grade.codeReport, late: capture?.timing ? capture.timing === "late" : null }),
    };
  });
}
