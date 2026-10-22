import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";
import { blindEvaluate, contextualAssessment, resolveStandard, type WorkKind } from "@/lib/quality/engine";

export const maxDuration = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORK_KINDS = new Set<WorkKind>(["written_answer", "case_solution", "presentation", "resume", "project", "proposal", "interview_response", "other"]);

type Body = { title?: unknown; work?: unknown; submissionDocumentId?: unknown; workKind?: unknown; mode?: unknown; assessmentId?: unknown; roleProfileId?: unknown; roleTitle?: unknown; criteriaText?: unknown; withContext?: unknown };
const optionalId = (value: unknown) => (typeof value === "string" && UUID.test(value) ? value : undefined);

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const mode = body?.mode === "role" ? "role" : body?.mode === "criteria" ? "criteria" : null;
  const workKind = typeof body?.workKind === "string" && WORK_KINDS.has(body.workKind as WorkKind) ? body.workKind as WorkKind : "other";
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 180) : "";
  if (!mode || !title) return NextResponse.json({ error: "Give the work a title and choose an evaluation mode." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const config = getAIProcessingConfig();
  if (!config.configured) return NextResponse.json({ error: "AI evaluation is not configured." }, { status: 503 });
  const { data: consent } = await supabase.from("ai_processing_consents").select("disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at").eq("user_id", userId).maybeSingle();
  if (!isAIConsentCurrent(consent, config)) return NextResponse.json({ error: "Review and accept the AI processing disclosure first." }, { status: 403 });

  // The work comes from pasted text or an attached submission document; nothing about the author is sent.
  let work = typeof body?.work === "string" ? body.work : "";
  const submissionDocumentId = optionalId(body?.submissionDocumentId);
  let context: { officialMark?: number | null; officialFeedback?: string } = {};
  if (submissionDocumentId) {
    const { data: document } = await supabase.from("submission_documents").select("extracted_text, submission_id").eq("id", submissionDocumentId).maybeSingle();
    if (!document) return NextResponse.json({ error: "Submission document not found." }, { status: 404 });
    work = document.extracted_text as string;
    const { data: submission } = await supabase.from("submissions").select("official_mark, official_feedback").eq("id", document.submission_id).maybeSingle();
    context = { officialMark: submission?.official_mark === null || submission?.official_mark === undefined ? null : Number(submission.official_mark), officialFeedback: (submission?.official_feedback as string) || "" };
  }
  work = work.trim();
  if (work.length < 80) return NextResponse.json({ error: "Paste or choose at least a paragraph of work to evaluate." }, { status: 400 });
  if (work.length > 60000) return NextResponse.json({ error: "The work is too long; evaluate one section at a time (60,000 characters max)." }, { status: 400 });

  try {
    const standard = await resolveStandard(supabase, { mode, assessmentId: optionalId(body?.assessmentId), roleProfileId: optionalId(body?.roleProfileId), roleTitle: typeof body?.roleTitle === "string" ? body.roleTitle : undefined, criteriaText: typeof body?.criteriaText === "string" ? body.criteriaText.slice(0, 4000) : undefined });
    const blind = await blindEvaluate(work, standard, workKind);
    const { data: previous } = await supabase.from("quality_checks").select("id, blind_report, overall_score, standard_label").eq("title", title).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const contextual = body?.withContext === true ? await contextualAssessment(blind, { ...context, targetRole: mode === "role" ? standard.label : undefined, previousOverall: previous?.overall_score === null || previous?.overall_score === undefined ? null : Number(previous.overall_score) }) : null;
    const { data: saved, error } = await supabase.from("quality_checks").insert({
      user_id: userId, title, content_hash: createHash("sha256").update(work).digest("hex"), findings: [], mode, work_kind: workKind,
      standard_source: standard.source, standard_label: standard.label.slice(0, 300), assessment_id: optionalId(body?.assessmentId) ?? null, role_profile_id: optionalId(body?.roleProfileId) ?? null,
      submission_document_id: submissionDocumentId ?? null, blind_report: { ...blind, criteria: standard.criteria }, contextual_report: contextual, overall_score: blind.overall, provider_model: config.model, previous_check_id: previous?.id ?? null,
    }).select("id").single();
    if (error || !saved) return NextResponse.json({ error: "The evaluation ran but could not be saved." }, { status: 500 });
    return NextResponse.json({ id: saved.id, standard: { source: standard.source, label: standard.label }, blind, contextual, previous: previous ? { overall: previous.overall_score === null ? null : Number(previous.overall_score), sameStandard: previous.standard_label === standard.label.slice(0, 300), report: previous.blind_report } : null }, { status: 201 });
  } catch (failure) {
    return NextResponse.json({ error: failure instanceof Error ? failure.message : "Evaluation failed." }, { status: 422 });
  }
}
