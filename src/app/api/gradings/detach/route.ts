import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError } from "@/lib/drive-sync/http";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Detaches a file the member confirms is not this assessment's submission. The Drive match is marked as decided
// by the member, so the nightly matching does not attach it again, and grades made from it are removed.
export async function POST(request: NextRequest) {
  try {
    await requireWorkspaceMember();
    const body = (await request.json().catch(() => null)) as { submissionId?: string; documentId?: string } | null;
    if (!UUID.test(body?.submissionId ?? "") || !UUID.test(body?.documentId ?? "")) return NextResponse.json({ error: "Choose a file to detach." }, { status: 400 });
    const supabase = await createClient();
    const { data: document } = await supabase.from("submission_documents").select("id, name, source_kind, source_id, course_material_id, storage_path").eq("id", body!.documentId!).eq("submission_id", body!.submissionId!).maybeSingle();
    if (!document) return NextResponse.json({ error: "That file is not attached to this submission." }, { status: 404 });
    // Every version of the same Drive file on this submission goes with it, and the decision covers all versions.
    const { data: copies } = document.source_kind === "drive" && document.source_id ? await supabase.from("submission_documents").select("id, course_material_id").eq("submission_id", body!.submissionId!).eq("source_kind", "drive").eq("source_id", document.source_id) : { data: null };
    const rows = copies?.length ? copies : [document];
    const { error } = await supabase.from("submission_documents").delete().in("id", rows.map((row) => row.id));
    if (error) return NextResponse.json({ error: "The file could not be detached." }, { status: 500 });
    const { data: versions } = document.source_kind === "drive" && document.source_id ? await supabase.from("course_materials").select("id").eq("drive_source_id", document.source_id) : { data: null };
    const materialIds = [...new Set([...rows.map((row) => row.course_material_id), ...(versions ?? []).map((row) => row.id)].filter((id): id is string => Boolean(id)))];
    if (materialIds.length) await supabase.from("material_submission_matches").update({ kind: "undetermined", method: "member", confidence: "high", reason: "Detached by a workspace member: not the submission for the assessment it was matched to.", submission_id: null, assessment_id: null, assessment_user_id: null, updated_at: new Date().toISOString() }).in("material_id", materialIds);
    if (document.storage_path) await supabase.storage.from("submission-files").remove([document.storage_path]).catch(() => undefined);
    // Grades computed from the wrong file no longer describe this submission.
    await createAdminClient().from("submission_gradings").delete().eq("submission_id", body!.submissionId!);
    return NextResponse.json({ detached: document.name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "Could not detach the file." }, { status: error instanceof HttpError ? error.status : 500 });
  }
}
