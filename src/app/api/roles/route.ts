import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase to save a role profile." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { title?: string; industry?: string; source?: string; competencies?: string[] } | null;
  const title = body?.title?.trim();
  const competencies = Array.isArray(body?.competencies) ? body.competencies.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean).slice(0, 40) : [];
  if (!title || !competencies.length) return NextResponse.json({ error: "Enter a role title and at least one competency." }, { status: 400 });
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in to save a role profile." }, { status: 401 });
  const { data, error } = await supabase.from("role_profiles").insert({ user_id: userId, title: title.slice(0, 160), industry: body?.industry?.slice(0, 120) ?? "", benchmark_source: body?.source?.trim().slice(0, 400) || "user_supplied", competencies }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not save this private role profile." }, { status: 400 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
