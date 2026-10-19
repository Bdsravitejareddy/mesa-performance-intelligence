import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

type OfficialCriterion = { title?: string; description?: string; weight?: number; maximumMarks?: number; sourceReference?: string };

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase to record an official rubric." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { assessmentId?: string; maximumMarks?: number; sourceMaterialId?: string; criteria?: OfficialCriterion[] } | null;
  if (!body?.assessmentId || !Number.isFinite(body.maximumMarks) || Number(body.maximumMarks) <= 0 || !Array.isArray(body.criteria) || body.criteria.length < 1 || body.criteria.length > 20) return NextResponse.json({ error: "Enter an assessment, rubric maximum, and 1–20 official criteria." }, { status: 400 });
  if (body.criteria.some((item) => !item.title?.trim() || !Number.isFinite(item.weight) || Number(item.weight) < 0 || !Number.isFinite(item.maximumMarks) || Number(item.maximumMarks) <= 0)) return NextResponse.json({ error: "Each official criterion needs a title, non-negative weight, and positive maximum marks." }, { status: 400 });
  const criteriaMax = body.criteria.reduce((sum, item) => sum + Number(item.maximumMarks), 0);
  if (Math.abs(criteriaMax - Number(body.maximumMarks)) > 0.05) return NextResponse.json({ error: "Criterion maximum marks must add up to the official rubric maximum." }, { status: 400 });

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in to record a rubric." }, { status: 401 });
  const { data: assessment } = await supabase.from("assessments").select("id, course_id").eq("id", body.assessmentId).maybeSingle();
  if (!assessment) return NextResponse.json({ error: "Assessment was not found in this workspace." }, { status: 404 });
  const { data: existing } = await supabase.from("rubrics").select("id").eq("assessment_id", assessment.id).eq("source_kind", "official").limit(1).maybeSingle();
  if (existing) return NextResponse.json({ error: "An official rubric is already recorded. Edit that record through the established faculty source instead." }, { status: 409 });
  if (body.sourceMaterialId) {
    const { data: source } = await supabase.from("course_materials").select("id").eq("id", body.sourceMaterialId).eq("course_id", assessment.course_id).maybeSingle();
    if (!source) return NextResponse.json({ error: "Selected source material is not part of this course." }, { status: 400 });
  }
  const { data: rubric, error } = await supabase.from("rubrics").insert({ user_id: userId, assessment_id: assessment.id, source_kind: "official", approval_status: "approved", maximum_marks: body.maximumMarks, source_material_id: body.sourceMaterialId || null, approved_at: new Date().toISOString() }).select("id").single();
  if (error || !rubric) return NextResponse.json({ error: "Could not save the official rubric record." }, { status: 400 });
  const { error: criteriaError } = await supabase.from("rubric_criteria").insert(body.criteria.map((item) => ({ user_id: userId, rubric_id: rubric.id, title: item.title!.trim().slice(0, 180), description: item.description?.slice(0, 3000) ?? "", weight: item.weight, maximum_marks: item.maximumMarks, source_reference: item.sourceReference?.slice(0, 1000) ?? "" })));
  if (criteriaError) {
    await supabase.from("rubrics").delete().eq("id", rubric.id);
    return NextResponse.json({ error: "Rubric criteria could not be saved; the partial rubric record was removed." }, { status: 400 });
  }
  return NextResponse.json({ id: rubric.id, sourceKind: "official", approvalStatus: "approved" }, { status: 201 });
}
