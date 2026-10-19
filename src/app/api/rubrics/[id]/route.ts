import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

type EditedCriterion = { id?: string; title?: string; description?: string; weight?: number; maximumMarks?: number; sourceReference?: string };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase to review rubrics." }, { status: 503 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { criteria?: EditedCriterion[]; approvalStatus?: "pending_review" | "approved" } | null;
  if (!Array.isArray(body?.criteria) || body.criteria.length < 2 || body.criteria.length > 12) return NextResponse.json({ error: "A rubric must have 2–12 criteria." }, { status: 400 });
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in before reviewing a rubric." }, { status: 401 });
  const { data: rubric } = await supabase.from("rubrics").select("id, user_id, source_kind, maximum_marks").eq("id", id).maybeSingle();
  if (!rubric) return NextResponse.json({ error: "Rubric was not found in this workspace." }, { status: 404 });
  if (rubric.source_kind !== "inferred") return NextResponse.json({ error: "Official rubrics are preserved and cannot be overwritten here." }, { status: 409 });
  const criteria = body.criteria;
  if (criteria.some((item) => !item.title?.trim() || !Number.isFinite(item.weight) || !Number.isFinite(item.maximumMarks) || Number(item.weight) <= 0 || Number(item.maximumMarks) <= 0)) return NextResponse.json({ error: "Each criterion needs a title, positive weight, and positive maximum marks." }, { status: 400 });
  const weightTotal = criteria.reduce((sum, item) => sum + Number(item.weight), 0);
  const marksTotal = criteria.reduce((sum, item) => sum + Number(item.maximumMarks), 0);
  if (Math.abs(weightTotal - 100) > 0.05 || Math.abs(marksTotal - Number(rubric.maximum_marks)) > 0.05) return NextResponse.json({ error: "Criterion weights must total 100 and criterion marks must total the assessment maximum." }, { status: 400 });

  const { data: existing } = await supabase.from("rubric_criteria").select("id").eq("rubric_id", id);
  const existingIds = new Set((existing ?? []).map((item) => item.id));
  const keptIds: string[] = [];
  for (const item of criteria) {
    const row = { title: item.title!.trim().slice(0, 160), description: item.description?.slice(0, 2000) ?? "", weight: item.weight, maximum_marks: item.maximumMarks, source_reference: item.sourceReference?.slice(0, 1000) ?? "" };
    if (item.id && existingIds.has(item.id)) {
      const { error } = await supabase.from("rubric_criteria").update(row).eq("id", item.id).eq("rubric_id", id);
      if (error) return NextResponse.json({ error: "Could not update rubric criteria." }, { status: 400 });
      keptIds.push(item.id);
    } else {
      const { data, error } = await supabase.from("rubric_criteria").insert({ ...row, user_id: rubric.user_id, rubric_id: id }).select("id").single();
      if (error || !data) return NextResponse.json({ error: "Could not add a rubric criterion." }, { status: 400 });
      keptIds.push(data.id);
    }
  }
  const removeIds = [...existingIds].filter((existingId) => !keptIds.includes(existingId));
  if (removeIds.length) await supabase.from("rubric_criteria").delete().in("id", removeIds).eq("rubric_id", id);
  const approvalStatus = body.approvalStatus === "approved" ? "approved" : "pending_review";
  const { error: approvalError } = await supabase.from("rubrics").update({ approval_status: approvalStatus, approved_at: approvalStatus === "approved" ? new Date().toISOString() : null }).eq("id", id);
  if (approvalError) return NextResponse.json({ error: "Criteria were saved, but approval status was not updated." }, { status: 400 });
  return NextResponse.json({ id, approvalStatus });
}
