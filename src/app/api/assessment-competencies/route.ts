import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPETENCY_ID = /^[a-z_]+\.[a-z_]+$/;

// Replaces the member-tagged competencies for one assessment. Official-rubric, learning-objective and AI mappings are left untouched.
export async function PUT(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase to map assessments." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { assessmentId?: unknown; competencyIds?: unknown } | null;
  const assessmentId = typeof body?.assessmentId === "string" ? body.assessmentId : "";
  const competencyIds = Array.isArray(body?.competencyIds) ? [...new Set(body.competencyIds.filter((id): id is string => typeof id === "string"))] : null;
  if (!UUID.test(assessmentId) || !competencyIds || competencyIds.length > 12 || competencyIds.some((id) => !COMPETENCY_ID.test(id))) {
    return NextResponse.json({ error: "Choose an assessment and up to 12 competencies." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (typeof claimsData?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in to map assessments." }, { status: 401 });

  // RLS limits this to workspace assessments; the mapping inherits the assessment owner.
  const { data: assessment, error: assessmentError } = await supabase.from("assessments").select("id, user_id").eq("id", assessmentId).maybeSingle();
  if (assessmentError) return NextResponse.json({ error: "Could not load the assessment." }, { status: 500 });
  if (!assessment) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });

  if (competencyIds.length) {
    const { data: known, error } = await supabase.from("competencies").select("id").in("id", competencyIds);
    if (error) return NextResponse.json({ error: "Could not load competencies." }, { status: 500 });
    if ((known ?? []).length !== competencyIds.length) return NextResponse.json({ error: "Unknown competency." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase.from("assessment_competencies").select("competency_id, mapping_source").eq("assessment_id", assessmentId);
  if (existingError) return NextResponse.json({ error: "Could not load existing mappings." }, { status: 500 });
  const existingIds = new Set((existing ?? []).map((row) => row.competency_id));
  const removals = (existing ?? []).filter((row) => row.mapping_source === "user_tagged" && !competencyIds.includes(row.competency_id)).map((row) => row.competency_id);
  const additions = competencyIds.filter((id) => !existingIds.has(id));

  if (removals.length) {
    const { error } = await supabase.from("assessment_competencies").delete().eq("assessment_id", assessmentId).eq("mapping_source", "user_tagged").in("competency_id", removals);
    if (error) return NextResponse.json({ error: "Could not update mappings." }, { status: 500 });
  }
  if (additions.length) {
    const { error } = await supabase.from("assessment_competencies").insert(additions.map((competencyId) => ({ user_id: assessment.user_id, assessment_id: assessmentId, competency_id: competencyId, mapping_source: "user_tagged", review_status: "accepted" })));
    if (error) return NextResponse.json({ error: "Could not update mappings." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, added: additions.length, removed: removals.length });
}
