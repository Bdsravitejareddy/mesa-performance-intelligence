import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { gradeSubmissions } from "@/lib/grading/run";

export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Grades now instead of waiting for the nightly run. Runs with the member's session, so RLS applies.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { submissionId?: unknown } | null;
  const submissionId = typeof body?.submissionId === "string" && UUID.test(body.submissionId) ? body.submissionId : undefined;
  try {
    const outcomes = await gradeSubmissions(supabase, 280_000, submissionId ? { submissionIds: [submissionId] } : {});
    return NextResponse.json({ outcomes });
  } catch {
    return NextResponse.json({ error: "Grading failed. Try again shortly." }, { status: 500 });
  }
}
