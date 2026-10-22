import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Saves (or clears, when empty) a member's note on one page of a course material. The imported page is never changed.
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase to save notes." }, { status: 503 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { pageNumber?: unknown; note?: unknown } | null;
  const pageNumber = typeof body?.pageNumber === "number" && Number.isInteger(body.pageNumber) ? body.pageNumber : 0;
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  if (!UUID.test(id) || pageNumber < 1 || note === null || note.length > 2000) return NextResponse.json({ error: "Choose a page and write up to 2,000 characters." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in to save notes." }, { status: 401 });
  const { data: material } = await supabase.from("course_materials").select("id, user_id").eq("id", id).maybeSingle();
  if (!material) return NextResponse.json({ error: "Material not found." }, { status: 404 });
  const { data: page } = await supabase.from("material_pages").select("id").eq("material_id", id).eq("page_number", pageNumber).maybeSingle();
  if (!page) return NextResponse.json({ error: "That page does not exist in this material." }, { status: 404 });

  if (!note) {
    const { error } = await supabase.from("material_page_notes").delete().eq("material_id", id).eq("page_number", pageNumber).eq("author_kind", "member");
    if (error) return NextResponse.json({ error: "Could not clear the note." }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: true });
  }
  const { error } = await supabase.from("material_page_notes").upsert({ user_id: material.user_id, material_id: id, page_number: pageNumber, author_kind: "member", note, updated_by: claims.claims.sub, updated_at: new Date().toISOString() }, { onConflict: "material_id,page_number,author_kind" });
  if (error) return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
