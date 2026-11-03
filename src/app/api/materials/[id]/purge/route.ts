import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/config";

// Permanently erases a quarantined material's indexed text and stored file, at the member's request. The material row
// stays as a record of what was removed, so Drive sync does not import the same file again. Guests cannot reach this.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  // Membership is checked through the signed-in session before any privileged step.
  const { data: quarantined } = await supabase.rpc("quarantined_materials_overview");
  const target = ((quarantined ?? []) as { material_id: string; storage_path: string; purged_at: string | null }[]).find((row) => row.material_id === id);
  if (!target) return NextResponse.json({ error: "Only a quarantined material in this workspace can be erased." }, { status: 404 });
  const admin = createAdminClient();
  const { error: removeError } = await admin.storage.from("course-files").remove([target.storage_path]);
  if (removeError) return NextResponse.json({ error: "The stored file could not be removed." }, { status: 500 });
  const { data, error } = await admin.rpc("purge_quarantined_material", { p_material_id: id });
  if (error) return NextResponse.json({ error: "The file was removed, but its indexed text could not be erased." }, { status: 500 });
  return NextResponse.json({ ok: true, pages: (data as { pages?: number } | null)?.pages ?? 0 });
}
