import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function setup(context: { params: Promise<{ id: string }> }) {
  if (!hasSupabaseConfig()) return { response: NextResponse.json({ error: "Connect Supabase to review materials." }, { status: 503 }) };
  const { id } = await context.params;
  if (!UUID.test(id)) return { response: NextResponse.json({ error: "Unknown material." }, { status: 400 }) };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return { response: NextResponse.json({ error: "Sign in to review materials." }, { status: 401 }) };
  const { data: material } = await supabase.from("course_materials").select("id, user_id").eq("id", id).maybeSingle();
  if (!material) return { response: NextResponse.json({ error: "Material not found." }, { status: 404 }) };
  return { supabase, material, reviewer: claims.claims.sub };
}

// Records that a member has looked at a flagged document: "reviewed" (notes added where needed) or "not_needed".
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ready = await setup(context);
  if (!ready.supabase) return ready.response;
  const body = (await request.json().catch(() => null)) as { outcome?: unknown; note?: unknown } | null;
  const outcome = body?.outcome === "reviewed" || body?.outcome === "not_needed" ? body.outcome : null;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!outcome || note.length > 1000) return NextResponse.json({ error: "Choose an outcome." }, { status: 400 });
  const { error } = await ready.supabase.from("material_reviews").upsert({ material_id: ready.material.id, user_id: ready.material.user_id, outcome, note, reviewed_by: ready.reviewer, reviewed_at: new Date().toISOString() }, { onConflict: "material_id" });
  if (error) return NextResponse.json({ error: "Could not save the review." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ready = await setup(context);
  if (!ready.supabase) return ready.response;
  const { error } = await ready.supabase.from("material_reviews").delete().eq("material_id", ready.material.id);
  if (error) return NextResponse.json({ error: "Could not reopen the review." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
