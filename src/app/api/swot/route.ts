import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const categories = new Set(["strength", "weakness", "opportunity", "threat"]);

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase to save SWOT evidence." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { category?: string; title?: string; evidence?: string; sourceReference?: string } | null;
  if (!body?.category || !categories.has(body.category) || !body.title?.trim()) return NextResponse.json({ error: "Choose a SWOT category and enter a title." }, { status: 400 });
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in to save SWOT evidence." }, { status: 401 });
  const { error } = await supabase.from("swot_entries").insert({ user_id: userId, category: body.category, title: body.title.trim().slice(0, 180), evidence: body.evidence?.slice(0, 4000) ?? "", source_reference: body.sourceReference?.slice(0, 400) ?? "" });
  if (error) return NextResponse.json({ error: "Could not save this private SWOT entry." }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
