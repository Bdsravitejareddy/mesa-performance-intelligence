import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { visionAvailable } from "@/lib/ai/gemini-vision";
import { describeMaterial, describePendingMaterials } from "@/lib/materials/vision";

export const maxDuration = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Describes one material, or works through pending flagged materials within the time budget.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase to describe materials." }, { status: 503 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in to describe materials." }, { status: 401 });
  const available = visionAvailable();
  if (!available.ok) return NextResponse.json({ error: available.reason }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { materialId?: unknown };
  if (body.materialId !== undefined) {
    if (typeof body.materialId !== "string" || !UUID.test(body.materialId)) return NextResponse.json({ error: "Unknown material." }, { status: 400 });
    return NextResponse.json({ outcomes: [await describeMaterial(supabase, body.materialId)] });
  }
  return NextResponse.json({ outcomes: await describePendingMaterials(supabase, 240_000) });
}
