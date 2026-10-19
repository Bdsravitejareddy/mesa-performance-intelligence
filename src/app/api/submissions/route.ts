import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { isValidOfficialMark } from "@/lib/scoring";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase before saving assessment records." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { assessmentId?: string; answerText?: string; officialMark?: number | null; officialFeedback?: string } | null;
  if (!body?.assessmentId || typeof body.answerText !== "string" || body.answerText.length > 100_000) return NextResponse.json({ error: "Assessment and answer text are required (maximum 100,000 characters)." }, { status: 400 });
  if (body.officialMark !== null && body.officialMark !== undefined && !isValidOfficialMark(body.officialMark)) return NextResponse.json({ error: "Official marks must be from 0 to 100." }, { status: 400 });
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in to save assessment records." }, { status: 401 });
  const { data: assessment } = await supabase.from("assessments").select("id, user_id").eq("id", body.assessmentId).maybeSingle();
  if (!assessment) return NextResponse.json({ error: "Assessment was not found in this workspace." }, { status: 404 });
  const { data, error } = await supabase.from("submissions").insert({
    user_id: assessment.user_id,
    assessment_id: body.assessmentId,
    answer_text: body.answerText,
    official_mark: body.officialMark ?? null,
    official_feedback: body.officialFeedback?.slice(0, 10_000) ?? "",
    official_mark_source: body.officialMark === null || body.officialMark === undefined ? "" : "user_entered",
    submitted_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not save the assessment record. Confirm the assessment belongs to this workspace." }, { status: 400 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
