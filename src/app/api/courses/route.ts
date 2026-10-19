import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase before creating courses." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { title?: string; code?: string; term?: string } | null;
  const title = body?.title?.trim();
  if (!title || title.length > 160) return NextResponse.json({ error: "Enter a course title up to 160 characters." }, { status: 400 });

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in before creating a course." }, { status: 401 });

  const { data, error } = await supabase.from("courses").insert({
    user_id: userId,
    title,
    code: body?.code?.trim().slice(0, 40) ?? "",
    term: body?.term?.trim().slice(0, 80) ?? "",
  }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not create this course. Check the database migration." }, { status: 400 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
