import { NextResponse, type NextRequest } from "next/server";
import { mapRoleEvidence, type CareerEvidence, type RoleCompetency } from "@/lib/career/evidence-map";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type StoredRole = { id: string; user_id: string; competencies: unknown };
type EvidenceRow = { id: string; criterion?: string; finding?: string; submission_quote?: string; confidence?: string; evaluation_id?: string; material_reference_id?: string; topic?: string; state?: string; evidence_count?: number; evidence_summary?: string; answer_text?: string; assessment_id?: string };

function parseRoleCompetencies(value: unknown): RoleCompetency[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    if (typeof row.title !== "string" || !row.title.trim()) return [];
    return [{ id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : `requirement-${index + 1}`, title: row.title.trim(), description: typeof row.description === "string" ? row.description : "", sourceQuote: typeof row.sourceQuote === "string" ? row.sourceQuote : "", evidenceKind: ["responsibility", "required", "preferred"].includes(String(row.evidenceKind)) ? row.evidenceKind as RoleCompetency["evidenceKind"] : "required" }];
  });
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== "string" || item.length > 80)) return null;
  return [...new Set(value as string[])];
}

function wordMatch(text: string, term: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  const needle = normalize(term);
  const source = normalize(text);
  return needle.length > 2 && (` ${source} `).includes(` ${needle} `);
}

async function member() {
  if (!hasSupabaseConfig()) return { response: NextResponse.json({ error: "Connect Supabase to manage career evidence." }, { status: 503 }) };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return { response: NextResponse.json({ error: "Sign in to manage private career evidence." }, { status: 401 }) };
  return { supabase, userId };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await member();
  if (auth.response) return auth.response;
  const roleProfileId = request.nextUrl.searchParams.get("roleProfileId")?.trim();
  if (!roleProfileId || roleProfileId.length > 80) return NextResponse.json({ error: "Select a saved role benchmark." }, { status: 400 });
  const { data, error } = await auth.supabase.from("role_evidence_findings").select("id,role_profile_id,requirement_id,competency,requirement_quote,suggested_state,state,review_status,evidence_refs,confidence,next_action,updated_at").eq("user_id", auth.userId).eq("role_profile_id", roleProfileId).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Career evidence review state is unavailable." }, { status: 503 });
  return NextResponse.json({ findings: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await member();
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.roleProfileId !== "string" || body.roleProfileId.length > 80) return NextResponse.json({ error: "Select a valid saved role benchmark." }, { status: 400 });
  const evidenceIds = strings(body.evidenceIds);
  if (!evidenceIds || !evidenceIds.length) return NextResponse.json({ error: "Select at least one saved evaluation, topic, or submission evidence record." }, { status: 400 });
  const { data: role, error: roleError } = await auth.supabase.from("role_profiles").select("id,user_id,competencies").eq("id", body.roleProfileId).eq("user_id", auth.userId).maybeSingle() as { data: StoredRole | null; error: unknown };
  if (roleError) return NextResponse.json({ error: "Role benchmark could not be loaded." }, { status: 503 });
  if (!role) return NextResponse.json({ error: "Role benchmark was not found in this workspace." }, { status: 404 });
  const requirements = parseRoleCompetencies(role.competencies);
  if (!requirements.length) return NextResponse.json({ error: "This role benchmark has no valid saved requirements." }, { status: 409 });

  const [evaluations, topics, submissions] = await Promise.all([
    auth.supabase.from("evaluation_evidence").select("id,user_id,criterion,finding,submission_quote,confidence,evaluation_id,material_reference_id").eq("user_id", auth.userId).in("id", evidenceIds),
    auth.supabase.from("topic_competencies").select("id,user_id,topic,state,evidence_count,evidence_summary").eq("user_id", auth.userId).in("id", evidenceIds),
    auth.supabase.from("submissions").select("id,user_id,answer_text,assessment_id").eq("user_id", auth.userId).in("id", evidenceIds),
  ]);
  if (evaluations.error || topics.error || submissions.error) return NextResponse.json({ error: "Saved course or submission evidence could not be loaded." }, { status: 503 });
  const rows = [...(evaluations.data ?? []), ...(topics.data ?? []), ...(submissions.data ?? [])] as EvidenceRow[];
  const distinctRows = [...new Map(rows.map((row) => [row.id, row])).values()];
  if (distinctRows.length !== evidenceIds.length) return NextResponse.json({ error: "One or more evidence references are unavailable in this workspace." }, { status: 400 });

  const evalIds = distinctRows.flatMap((row) => row.evaluation_id ? [row.evaluation_id] : []);
  const materialIds = distinctRows.flatMap((row) => row.material_reference_id ? [row.material_reference_id] : []);
  const [reports, references, assessmentRows] = await Promise.all([
    evalIds.length ? auth.supabase.from("evaluation_reports").select("id,status").eq("user_id", auth.userId).in("id", evalIds) : Promise.resolve({ data: [], error: null }),
    materialIds.length ? auth.supabase.from("material_references").select("id,reference_label").eq("user_id", auth.userId).in("id", materialIds) : Promise.resolve({ data: [], error: null }),
    distinctRows.some((row) => row.assessment_id) ? auth.supabase.from("assessments").select("id,title").eq("user_id", auth.userId).in("id", distinctRows.flatMap((row) => row.assessment_id ? [row.assessment_id] : [])) : Promise.resolve({ data: [], error: null }),
  ]);
  if (reports.error || references.error || assessmentRows.error) return NextResponse.json({ error: "Evidence provenance could not be loaded." }, { status: 503 });
  const reportById = new Map((reports.data ?? []).map((item) => [item.id, item.status]));
  const referenceById = new Map((references.data ?? []).map((item) => [item.id, item.reference_label]));
  const assessmentById = new Map((assessmentRows.data ?? []).map((item) => [item.id, item.title]));
  const evidence = distinctRows.flatMap((row): CareerEvidence[] => {
    if (row.evaluation_id) {
      const approved = ["approved", "reviewed"].includes(reportById.get(row.evaluation_id) ?? "");
      return [{ id: row.id, kind: "evaluation_finding", label: `Course evaluation · ${row.criterion ?? "finding"}`, quote: row.submission_quote || row.finding || "", sourceReference: referenceById.get(row.material_reference_id ?? "") ?? `Evaluation ${row.evaluation_id}`, competencies: [row.criterion ?? ""], confidence: (row.confidence === "high" || row.confidence === "medium" || row.confidence === "low" ? row.confidence : "insufficient"), accepted: approved, polarity: "supports" }];
    }
    if (row.topic) return [{ id: row.id, kind: "topic_competency", label: `Course topic · ${row.topic}`, quote: row.evidence_summary ?? "", sourceReference: `Course topic: ${row.topic}`, competencies: [row.topic], confidence: row.state === "demonstrated" && Number(row.evidence_count) > 0 ? "high" : "medium", accepted: row.state === "demonstrated" && Number(row.evidence_count) > 0, polarity: "supports" }];
    const answer = row.answer_text ?? "";
    const matches = requirements.filter((requirement) => wordMatch(answer, requirement.title));
    if (!matches.length) return [];
    return [{ id: row.id, kind: "linked_submission", label: `Linked assessment submission · ${assessmentById.get(row.assessment_id ?? "") ?? "assessment"}`, quote: answer.slice(0, 600), sourceReference: `Submission ${row.id} · ${assessmentById.get(row.assessment_id ?? "") ?? "assessment"}`, competencies: matches.map((item) => item.title), confidence: "medium", accepted: false, polarity: "supports" }];
  });
  const findings = mapRoleEvidence(requirements, evidence);
  const { data: priorFindings, error: priorError } = await auth.supabase.from("role_evidence_findings").select("requirement_id,state,suggested_state,review_status").eq("user_id", auth.userId).eq("role_profile_id", role.id);
  if (priorError) return NextResponse.json({ error: "Existing career evidence review state could not be loaded." }, { status: 503 });
  const priorByRequirement = new Map((priorFindings ?? []).map((item) => [item.requirement_id, item]));
  const stored = [];
  for (const finding of findings) {
    const prior = priorByRequirement.get(finding.requirementId);
    if (prior && prior.review_status !== "suggested") {
      stored.push(prior);
      continue;
    }
    const refs = finding.evidenceIds.map((id, index) => ({ id, kind: finding.evidenceKinds[index], quote: finding.evidenceQuotes[index], sourceLabel: finding.sourceLabels[index], sourceReference: finding.sourceReferences[index] }));
    const { data, error } = await auth.supabase.from("role_evidence_findings").upsert({
      user_id: auth.userId,
      role_profile_id: role.id,
      requirement_id: finding.requirementId,
      competency: finding.competency,
      requirement_quote: requirements.find((item) => item.id === finding.requirementId)?.sourceQuote ?? "",
      suggested_state: finding.state,
      state: finding.state === "demonstrated" ? "adjacent" : finding.state,
      review_status: "suggested",
      evidence_refs: refs,
      confidence: finding.confidence,
      next_action: finding.nextAction,
      updated_at: new Date().toISOString(),
    }, { onConflict: "role_profile_id,requirement_id" }).select("id,role_profile_id,requirement_id,competency,requirement_quote,suggested_state,state,review_status,evidence_refs,confidence,next_action,updated_at").single();
    if (error || !data) return NextResponse.json({ error: "Career evidence suggestions could not be saved." }, { status: 400 });
    stored.push(data);
  }
  return NextResponse.json({ findings: stored }, { status: 201 });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await member();
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || body.id.length > 80 || !["accepted", "dismissed"].includes(String(body.reviewStatus))) return NextResponse.json({ error: "Choose accept or dismiss for a saved finding." }, { status: 400 });
  const { data: existing, error: lookupError } = await auth.supabase.from("role_evidence_findings").select("id,state,suggested_state").eq("id", body.id).eq("user_id", auth.userId).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Career evidence review state is unavailable." }, { status: 503 });
  if (!existing) return NextResponse.json({ error: "Career evidence finding was not found in this workspace." }, { status: 404 });
  const accepted = body.reviewStatus === "accepted";
  const { data, error } = await auth.supabase.from("role_evidence_findings").update({ review_status: body.reviewStatus, state: accepted ? "demonstrated" : existing.suggested_state === "demonstrated" ? "adjacent" : existing.suggested_state, updated_at: new Date().toISOString() }).eq("id", body.id).eq("user_id", auth.userId).select("id,state,review_status,updated_at").single();
  if (error || !data) return NextResponse.json({ error: "Career evidence review could not be saved." }, { status: 400 });
  return NextResponse.json({ finding: data });
}
