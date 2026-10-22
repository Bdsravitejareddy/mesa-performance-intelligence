import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";
import { resolveProviderSettings } from "@/lib/ai/settings";
import { retrieveRelevantReferences } from "@/lib/ai/retrieval";
import { blindEvaluate, resolveStandard, type Standard, type WorkKind } from "@/lib/quality/engine";
import { CODE_RULES_VERSION, codeGrade } from "./code-score";
import { compareWithFeedback } from "./compare";

export type GradingOutcome = { submissionId: string; assessment: string; status: "graded" | "code_only" | "unchanged" | "skipped"; note: string };

const AI_RESERVE_MS = 110_000; // never start an AI evaluation that could not finish inside the budget
const GRADABLE_SOURCES = new Set(["official_rubric", "approved_rubric", "course_objectives_inferred"]);

type SubmissionRow = { id: string; user_id: string; assessment_id: string; answer_text: string | null; official_mark: number | null; official_feedback: string | null };
type DocumentRow = { submission_id: string; name: string; extracted_text: string; extraction_status: string; source_version: string };

function workKind(title: string, format: string): WorkKind {
  const text = `${title} ${format}`.toLowerCase();
  if (/present|deck|slides|pitch/.test(text)) return "presentation";
  if (/case|async|workbook/.test(text)) return "case_solution";
  if (/proposal|plan/.test(text)) return "proposal";
  if (/project/.test(text)) return "project";
  return "written_answer";
}

// One inferred standard per assessment: later gradings reuse it, so scores stay comparable over time,
// unless an official or approved rubric now exists, which always takes precedence.
async function standardFor(client: SupabaseClient, assessmentId: string, aiAllowed: boolean): Promise<Standard | null> {
  const { data: rubrics } = await client.from("rubrics").select("id, source_kind, approval_status").eq("assessment_id", assessmentId);
  const hasRubric = (rubrics ?? []).some((row) => row.source_kind === "official" || row.approval_status === "approved");
  if (!hasRubric) {
    const { data: previous } = await client.from("submission_gradings").select("standard").eq("assessment_id", assessmentId).eq("standard_source", "course_objectives_inferred").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (previous?.standard && Array.isArray((previous.standard as Standard).criteria)) return previous.standard as Standard;
    if (!aiAllowed) return null;
  }
  const standard = await resolveStandard(client, { mode: "criteria", assessmentId });
  return GRADABLE_SOURCES.has(standard.source) ? standard : null;
}

export async function gradeSubmissions(client: SupabaseClient, budgetMs: number, options: { submissionIds?: string[] } = {}): Promise<GradingOutcome[]> {
  const deadline = Date.now() + budgetMs;
  const [documents, submissions, assessments, consents, latest] = await Promise.all([
    client.from("submission_documents").select("submission_id, name, extracted_text, extraction_status, source_version"),
    client.from("submissions").select("id, user_id, assessment_id, answer_text, official_mark, official_feedback"),
    client.from("assessments").select("id, course_id, title, assessment_format"),
    client.from("ai_processing_consents").select("user_id, disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at"),
    client.from("submission_gradings").select("submission_id, input_hash, ai_status").order("created_at", { ascending: false }),
  ]);
  if (documents.error || submissions.error || assessments.error) throw new Error("Grading inputs could not be loaded.");
  const docsBySubmission = new Map<string, DocumentRow[]>();
  for (const row of (documents.data ?? []) as DocumentRow[]) docsBySubmission.set(row.submission_id, [...(docsBySubmission.get(row.submission_id) ?? []), row]);
  const assessmentById = new Map((assessments.data ?? []).map((row) => [row.id as string, row as { id: string; course_id: string; title: string; assessment_format: string }]));
  const config = getAIProcessingConfig();
  const consentOk = new Map((consents.data ?? []).map((row) => [row.user_id as string, isAIConsentCurrent(row, config)]));
  const done = new Map<string, string>();
  for (const row of latest.data ?? []) if (row.ai_status !== "failed" && row.ai_status !== "pending") done.set(`${row.submission_id}:${row.input_hash}`, row.ai_status as string);
  const model = config.configured ? resolveProviderSettings().model.slice(0, 120) : "";
  const outcomes: GradingOutcome[] = [];

  const candidates = ((submissions.data ?? []) as SubmissionRow[]).filter((row) => !options.submissionIds || options.submissionIds.includes(row.id));
  for (const submission of candidates) {
    const assessment = assessmentById.get(submission.assessment_id);
    if (!assessment) continue;
    const docs = docsBySubmission.get(submission.id) ?? [];
    // Files whose images still await review are graded on their text; the note says visuals were not read.
    const readable = (doc: DocumentRow) => doc.extraction_status === "complete" || doc.extraction_status === "needs_visual_review";
    const pending = docs.filter((doc) => !readable(doc));
    const visualsUnread = docs.some((doc) => doc.extraction_status === "needs_visual_review");
    const text = [submission.answer_text ?? "", ...docs.filter(readable).map((doc) => `[${doc.name} · version ${doc.source_version}]\n${doc.extracted_text}`)].filter((part) => part.trim()).join("\n\n").trim();
    if (!text) { if (docs.length || submission.answer_text) outcomes.push({ submissionId: submission.id, assessment: assessment.title, status: "skipped", note: "No readable text in the submitted files." }); continue; }
    if (pending.length) { outcomes.push({ submissionId: submission.id, assessment: assessment.title, status: "skipped", note: `${pending.length} attached file${pending.length === 1 ? " is" : "s are"} not fully extracted; grading waits so no submitted work is left out.` }); continue; }
    if (Date.now() > deadline - 15_000) break;

    const aiAllowed = config.configured && consentOk.get(submission.user_id) === true;
    let standard: Standard | null;
    try { standard = await standardFor(client, assessment.id, aiAllowed && Date.now() < deadline - AI_RESERVE_MS); }
    catch (error) { outcomes.push({ submissionId: submission.id, assessment: assessment.title, status: "skipped", note: error instanceof Error ? error.message : "No criteria could be established." }); continue; }
    if (!standard) { outcomes.push({ submissionId: submission.id, assessment: assessment.title, status: "skipped", note: "No rubric yet, and AI is unavailable to derive provisional criteria from the course material." }); continue; }

    const refs = await retrieveRelevantReferences(client, assessment.course_id, assessment.id, `${assessment.title} ${standard.criteria.map((criterion) => criterion.name).join(" ")} ${text.slice(0, 3000)}`).catch(() => []);
    const official = submission.official_mark === null ? null : Number(submission.official_mark);
    const feedback = submission.official_feedback ?? "";
    const inputHash = createHash("sha256").update(JSON.stringify({ text, standard, refs: refs.map((ref) => ref.key + ref.excerpt.length), official, feedback, rules: CODE_RULES_VERSION })).digest("hex");
    if (done.has(`${submission.id}:${inputHash}`)) { outcomes.push({ submissionId: submission.id, assessment: assessment.title, status: "unchanged", note: "Already graded with these inputs." }); continue; }

    const code = codeGrade(text, standard.criteria, refs.map((ref) => ref.excerpt));
    let aiReport: Awaited<ReturnType<typeof blindEvaluate>> | null = null;
    let aiStatus: "complete" | "failed" | "skipped" = "skipped";
    let note = aiAllowed ? "" : "AI grading needs the current AI consent for this account; only the code score was computed.";
    if (visualsUnread) note = `${note} Images and charts in the submitted file were not read; only its text was graded.`.trim();
    if (aiAllowed && Date.now() < deadline - AI_RESERVE_MS) {
      try { aiReport = await blindEvaluate(text, standard, workKind(assessment.title, assessment.assessment_format)); aiStatus = "complete"; }
      catch (error) { aiStatus = "failed"; note = error instanceof Error ? error.message.slice(0, 300) : "AI grading failed; it will retry on the next run."; }
    } else if (aiAllowed) { aiStatus = "failed"; note = "Out of time for AI grading in this run; it will continue on the next run."; }

    const aiPoints = aiReport ? [...aiReport.issues, ...aiReport.strengths, ...aiReport.dimensions.flatMap((dimension) => [dimension.issue, dimension.strength])] : [];
    const comparison = compareWithFeedback({ feedback, aiPoints, official, ai: aiReport?.overall ?? null, code: code.score });
    const { error } = await client.from("submission_gradings").upsert({
      user_id: submission.user_id,
      submission_id: submission.id,
      assessment_id: assessment.id,
      input_hash: inputHash,
      standard_source: standard.source,
      standard_label: standard.label.slice(0, 300),
      standard,
      code_score: code.score,
      code_report: code.report,
      ai_score: aiReport?.overall ?? null,
      ai_report: aiReport,
      ai_status: aiStatus,
      official_mark: official,
      comparison: { ...comparison, note: note ? `${comparison.note} ${note}` : comparison.note },
      provider_model: aiReport ? model : "",
      rules_version: CODE_RULES_VERSION,
    }, { onConflict: "submission_id,input_hash" });
    outcomes.push({ submissionId: submission.id, assessment: assessment.title, status: error ? "skipped" : aiReport ? "graded" : "code_only", note: error ? "The grading could not be saved." : note || "Graded." });
  }
  return outcomes;
}
