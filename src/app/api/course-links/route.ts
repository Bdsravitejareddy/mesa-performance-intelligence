import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Session = { ok: true; supabase: Awaited<ReturnType<typeof createClient>> } | { ok: false; response: NextResponse };

async function session(): Promise<Session> {
  if (!hasSupabaseConfig()) return { ok: false, response: NextResponse.json({ error: "Connect Supabase to link courses." }, { status: 503 }) };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") return { ok: false, response: NextResponse.json({ error: "Sign in to link courses." }, { status: 401 }) };
  return { ok: true, supabase };
}

// Confirms a link. Owners are read from the course rows so each side keeps its original owner.
export async function POST(request: NextRequest) {
  const auth = await session();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { assessmentCourseId?: unknown; materialCourseId?: unknown } | null;
  const assessmentCourseId = typeof body?.assessmentCourseId === "string" ? body.assessmentCourseId : "";
  const materialCourseId = typeof body?.materialCourseId === "string" ? body.materialCourseId : "";
  if (!UUID.test(assessmentCourseId) || !UUID.test(materialCourseId) || assessmentCourseId === materialCourseId) return NextResponse.json({ error: "Choose two different courses." }, { status: 400 });

  const { data: courses, error } = await auth.supabase.from("courses").select("id, user_id").in("id", [assessmentCourseId, materialCourseId]);
  if (error) return NextResponse.json({ error: "Could not load the courses." }, { status: 500 });
  const assessmentCourse = courses?.find((row) => row.id === assessmentCourseId);
  const materialCourse = courses?.find((row) => row.id === materialCourseId);
  if (!assessmentCourse || !materialCourse) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  const { error: insertError } = await auth.supabase.from("course_links").insert({ user_id: assessmentCourse.user_id, assessment_course_id: assessmentCourseId, material_course_id: materialCourseId, material_course_user_id: materialCourse.user_id });
  if (insertError) {
    if (insertError.code === "23505") return NextResponse.json({ error: "That Drive course is already linked. Unlink it first." }, { status: 409 });
    if (insertError.code === "23514") return NextResponse.json({ error: "Links cannot be chained through another linked course." }, { status: 409 });
    return NextResponse.json({ error: "Could not save the link." }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await session();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { materialCourseId?: unknown } | null;
  const materialCourseId = typeof body?.materialCourseId === "string" ? body.materialCourseId : "";
  if (!UUID.test(materialCourseId)) return NextResponse.json({ error: "Choose a linked course." }, { status: 400 });
  const { data, error } = await auth.supabase.from("course_links").delete().eq("material_course_id", materialCourseId).select("id");
  if (error) return NextResponse.json({ error: "Could not remove the link." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Link not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
