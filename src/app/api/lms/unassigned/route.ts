import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { toAssessmentRow, toSubmissionRow } from "@/lib/lms/records";
import type { MesaAssignmentRecord } from "@/lib/lms/normalize";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A member confirms the course for an LMS assignment that arrived without one; it is imported immediately
// with the same rows the sync would create, and later syncs keep the member's choice.
export async function PUT(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { id?: unknown; courseId?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const courseId = typeof body?.courseId === "string" ? body.courseId : "";
  if (!UUID.test(id) || !UUID.test(courseId)) return NextResponse.json({ error: "Choose an assignment and a course." }, { status: 400 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const [{ data: held }, { data: course }] = await Promise.all([
    supabase.from("lms_unassigned_assignments").select("id, record, source_record_id").eq("id", id).maybeSingle(),
    supabase.from("courses").select("id, user_id").eq("id", courseId).maybeSingle(),
  ]);
  if (!held || !course) return NextResponse.json({ error: "Assignment or course not found." }, { status: 404 });
  const record = held.record as MesaAssignmentRecord;
  if (!record?.assignmentId || `mesa-lms:assignment:${record.assignmentId}` !== held.source_record_id) return NextResponse.json({ error: "The stored LMS record is incomplete." }, { status: 422 });

  const { data: assessment, error: assessmentError } = await supabase.from("assessments").upsert(toAssessmentRow(record, course.user_id, course.id), { onConflict: "user_id,source_record_id" }).select("id").single();
  if (assessmentError || !assessment) return NextResponse.json({ error: "The assessment could not be saved." }, { status: 500 });
  if (record.submissionId || record.score !== null || record.feedback || record.status) {
    const { error } = await supabase.from("submissions").upsert(toSubmissionRow(record, course.user_id, assessment.id), { onConflict: "user_id,source_record_id" });
    if (error) return NextResponse.json({ error: "The submission could not be saved." }, { status: 500 });
  }
  const { error } = await supabase.from("lms_unassigned_assignments").update({ resolved_course_id: course.id, resolution: "member", resolved_by: userId, resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "The course choice could not be saved." }, { status: 500 });
  return NextResponse.json({ ok: true, assessmentId: assessment.id });
}
