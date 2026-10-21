import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { parseCriterionScores } from "@/lib/feedback/criteria";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPETENCY_ID = /^[a-z_]+\.[a-z_]+$/;

// Replaces the member-tagged competencies for one assessment: whole-assessment tags plus optional criterion tags.
// Official-rubric, learning-objective and AI mappings are left untouched.
export async function PUT(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase to map assessments." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { assessmentId?: unknown; competencyIds?: unknown; criteria?: unknown } | null;
  const assessmentId = typeof body?.assessmentId === "string" ? body.assessmentId : "";
  const competencyIds = Array.isArray(body?.competencyIds) ? [...new Set(body.competencyIds.filter((id): id is string => typeof id === "string"))] : null;
  const criteriaInput = body?.criteria === undefined ? null : Array.isArray(body.criteria) ? body.criteria : "invalid";
  const criteria = criteriaInput === null || criteriaInput === "invalid" ? [] : criteriaInput.flatMap((item) => {
    const row = item as { label?: unknown; competencyId?: unknown };
    return typeof row?.label === "string" && typeof row.competencyId === "string" ? [{ label: row.label.trim(), competencyId: row.competencyId }] : [];
  });
  if (!UUID.test(assessmentId) || !competencyIds || competencyIds.length > 12 || competencyIds.some((id) => !COMPETENCY_ID.test(id))
    || criteriaInput === "invalid" || criteria.length > 20 || criteria.some((item) => !COMPETENCY_ID.test(item.competencyId) || !item.label || item.label.length > 80)) {
    return NextResponse.json({ error: "Choose an assessment and up to 12 competencies." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (typeof claimsData?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in to map assessments." }, { status: 401 });

  // RLS limits this to workspace assessments; the mapping inherits the assessment owner.
  const { data: assessment, error: assessmentError } = await supabase.from("assessments").select("id, user_id").eq("id", assessmentId).maybeSingle();
  if (assessmentError) return NextResponse.json({ error: "Could not load the assessment." }, { status: 500 });
  if (!assessment) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });

  const allIds = [...new Set([...competencyIds, ...criteria.map((item) => item.competencyId)])];
  if (allIds.length) {
    const { data: known, error } = await supabase.from("competencies").select("id").in("id", allIds);
    if (error) return NextResponse.json({ error: "Could not load competencies." }, { status: 500 });
    if ((known ?? []).length !== allIds.length) return NextResponse.json({ error: "Unknown competency." }, { status: 400 });
  }

  // Criterion labels must exist in this assessment's official feedback; arbitrary labels are rejected.
  if (criteria.length) {
    const { data: submissions, error } = await supabase.from("submissions").select("official_feedback").eq("assessment_id", assessmentId);
    if (error) return NextResponse.json({ error: "Could not load assessment feedback." }, { status: 500 });
    const labels = new Set((submissions ?? []).flatMap((row) => parseCriterionScores(row.official_feedback ?? "").map((item) => item.label.toLowerCase())));
    if (criteria.some((item) => !labels.has(item.label.toLowerCase()))) return NextResponse.json({ error: "A criterion is not present in this assessment's official feedback." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase.from("assessment_competencies").select("competency_id, mapping_source, criterion_label").eq("assessment_id", assessmentId);
  if (existingError) return NextResponse.json({ error: "Could not load existing mappings." }, { status: 500 });
  const memberRows = (existing ?? []).filter((row) => row.mapping_source === "user_tagged");
  const keyOf = (competencyId: string, label: string | null) => `${competencyId}|${(label ?? "").toLowerCase()}`;
  const wanted = new Map<string, { competencyId: string; label: string | null }>([
    ...competencyIds.map((id) => [keyOf(id, null), { competencyId: id, label: null }] as const),
    ...(criteriaInput === null ? memberRows.filter((row) => row.criterion_label).map((row) => [keyOf(row.competency_id, row.criterion_label), { competencyId: row.competency_id, label: row.criterion_label }] as const) : criteria.map((item) => [keyOf(item.competencyId, item.label), { competencyId: item.competencyId, label: item.label }] as const)),
  ]);
  const existingKeys = new Set((existing ?? []).map((row) => keyOf(row.competency_id, row.criterion_label)));
  const removals = memberRows.filter((row) => !wanted.has(keyOf(row.competency_id, row.criterion_label)));
  const additions = [...wanted.entries()].filter(([key]) => !existingKeys.has(key)).map(([, value]) => value);

  for (const row of removals) {
    const query = supabase.from("assessment_competencies").delete().eq("assessment_id", assessmentId).eq("mapping_source", "user_tagged").eq("competency_id", row.competency_id);
    const { error } = row.criterion_label ? await query.eq("criterion_label", row.criterion_label) : await query.is("criterion_label", null);
    if (error) return NextResponse.json({ error: "Could not update mappings." }, { status: 500 });
  }
  if (additions.length) {
    const { error } = await supabase.from("assessment_competencies").insert(additions.map((item) => ({ user_id: assessment.user_id, assessment_id: assessmentId, competency_id: item.competencyId, criterion_label: item.label, mapping_source: "user_tagged", review_status: "accepted" })));
    if (error) return NextResponse.json({ error: "Could not update mappings." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, added: additions.length, removed: removals.length });
}
