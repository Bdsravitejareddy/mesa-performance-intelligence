import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

// Marks whether an assessment counts toward the course grade (a hackathon or diagnostic may not, even when the LMS
// releases a score). Its mark stays visible either way; only standings and averages change.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as { countsTowardGrade?: unknown; note?: unknown } | null;
  if (typeof body?.countsTowardGrade !== "boolean") return NextResponse.json({ error: "Say whether it counts toward the grade." }, { status: 400 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const note = String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const { data, error } = await supabase.from("assessments").update({ counts_toward_grade: body.countsTowardGrade, grade_note: body.countsTowardGrade ? "" : note }).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
