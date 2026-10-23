import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspaceMember } from "@/lib/drive-sync/auth";
import { HttpError } from "@/lib/drive-sync/http";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_RUBRIC, sanitizeRubric } from "@/lib/settings/rubric";

// Saves the workspace rubric (validated and clamped), or resets it to the defaults.
export async function PUT(request: NextRequest) {
  try {
    await requireWorkspaceMember();
    const body = await request.json().catch(() => null) as { reset?: boolean; rubric?: unknown } | null;
    const settings = body?.reset ? DEFAULT_RUBRIC : sanitizeRubric(body?.rubric);
    const supabase = await createClient();
    const { error } = await supabase.from("rubric_settings").upsert({ id: "workspace", settings, updated_at: new Date().toISOString() }, { onConflict: "id" });
    return error ? NextResponse.json({ error: "The rubric could not be saved." }, { status: 500 }) : NextResponse.json({ rubric: settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof HttpError ? error.message : "Could not save." }, { status: error instanceof HttpError ? error.status : 500 });
  }
}
