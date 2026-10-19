import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase before creating assessments." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { courseId?: string; title?: string; format?: string; dueAt?: string } | null;
  if (!body?.courseId || !body.title?.trim()) return NextResponse.json({ error: "Select a course and enter an assessment title." }, { status: 400 });
  const allowedFormats = new Set(["written", "quantitative", "case", "presentation", "project", "other"]);
  const assessmentFormat = body.format && allowedFormats.has(body.format) ? body.format : "written";

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in before creating an assessment." }, { status: 401 });
  const { data: course } = await supabase.from("courses").select("id, user_id").eq("id", body.courseId).maybeSingle();
  if (!course) return NextResponse.json({ error: "Course was not found in this workspace." }, { status: 404 });

  const { data, error } = await supabase.from("assessments").insert({
    user_id: course.user_id,
    course_id: body.courseId,
    title: body.title.trim().slice(0, 180),
    assessment_format: assessmentFormat,
    official_max_mark: 100,
    due_at: body.dueAt || null,
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not create this assessment. Confirm the course exists." }, { status: 400 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
