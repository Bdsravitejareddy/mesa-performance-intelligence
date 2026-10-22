import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { matchDriveSubmissions } from "@/lib/materials/submission-matching";

export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? supabase : null;
}

// Runs submission recognition now instead of waiting for the nightly job.
export async function POST() {
  const supabase = await member();
  if (!supabase) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ outcomes: await matchDriveSubmissions(supabase, 240_000) });
  } catch {
    return NextResponse.json({ error: "Submission matching failed." }, { status: 500 });
  }
}

// "Not my submission": records the member's decision and detaches the file from the assessment.
export async function PATCH(request: NextRequest) {
  const supabase = await member();
  if (!supabase) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { materialId?: unknown } | null;
  const materialId = typeof body?.materialId === "string" ? body.materialId : "";
  if (!UUID.test(materialId)) return NextResponse.json({ error: "Unknown material." }, { status: 400 });
  const { data: match } = await supabase.from("material_submission_matches").select("material_id, submission_id").eq("material_id", materialId).maybeSingle();
  if (!match) return NextResponse.json({ error: "Match not found." }, { status: 404 });
  if (match.submission_id) await supabase.from("submission_documents").delete().eq("submission_id", match.submission_id).eq("course_material_id", materialId);
  const { error } = await supabase.from("material_submission_matches").update({ kind: "course_material", method: "member", confidence: "high", reason: "A member marked this file as not their submission.", submission_id: null, updated_at: new Date().toISOString() }).eq("material_id", materialId);
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
