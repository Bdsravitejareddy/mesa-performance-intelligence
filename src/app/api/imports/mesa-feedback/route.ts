import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { MESA_FEEDBACK_SOURCE, courseKey, feedbackText, parseFeedbackAssessment, recordId, toHundred } from "@/lib/imports/mesa-feedback";

// Imports MRS section marks and written feedback read from Mesa's Feedback page in the member's own signed-in
// browser (member-approved as official results, 2026-11-05; see AGENTS.md). Upserted by a stable record id, so
// reading the page again updates rather than duplicates. Guests cannot reach this route.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => null) as { assessments?: unknown } | null;
  const raw = Array.isArray(body?.assessments) ? (body.assessments as Record<string, unknown>[]).slice(0, 40) : [];
  if (!raw.length) return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
  const parsed = raw.map(parseFeedbackAssessment);
  const invalid = parsed.find((item) => "error" in item);
  if (invalid && "error" in invalid) return NextResponse.json({ error: invalid.error }, { status: 400 });

  const { data: courses } = await supabase.from("courses").select("id, user_id, title");
  const readOn = new Date().toISOString().slice(0, 10);
  const results: { assessment: string; course: string; mark?: number; status: string }[] = [];
  for (const item of parsed as Exclude<(typeof parsed)[number], { error: string }>[]) {
    const course = (courses ?? []).find((row) => courseKey(String(row.title)) === courseKey(item.course));
    if (!course) { results.push({ assessment: item.title, course: item.course, status: "no matching course" }); continue; }
    const sourceId = recordId(item);
    // Course-dependent rows inherit the course's owner, so either approved account can import.
    const { data: assessment, error: assessmentError } = await supabase.from("assessments").upsert({
      user_id: course.user_id, course_id: course.id, title: item.title, official_max_mark: 100, source_max_mark: item.max, source_record_id: sourceId,
    }, { onConflict: "user_id,source_record_id" }).select("id").single();
    if (assessmentError || !assessment) { results.push({ assessment: item.title, course: String(course.title), status: "assessment not saved" }); continue; }
    const mark = toHundred(item.score, item.max);
    const { error: submissionError } = await supabase.from("submissions").upsert({
      user_id: course.user_id, assessment_id: assessment.id, answer_text: "", official_mark: mark, source_original_mark: item.score, source_original_max_mark: item.max,
      official_feedback: feedbackText(item, readOn), official_mark_source: MESA_FEEDBACK_SOURCE, source_record_id: `${sourceId}:submission`, lms_submission_status: "graded", source_updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,source_record_id" });
    results.push({ assessment: item.title, course: String(course.title), mark, status: submissionError ? "mark not saved" : "saved" });
  }
  const failed = results.filter((row) => row.status !== "saved");
  return NextResponse.json({ results, saved: results.length - failed.length, failed: failed.length }, { status: failed.length ? 207 : 201 });
}
