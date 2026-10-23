import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { runAiSkillView } from "@/lib/profile/skills";

export const maxDuration = 200;

// Re-runs the AI's reading of each skill domain for the signed-in member.
export async function POST() {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: rows } = await supabase.from("competencies").select("domain_name");
  try {
    const result = await runAiSkillView(supabase, userId, [...new Set((rows ?? []).map((row) => row.domain_name as string))]);
    return result.ok ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: result.error }, { status: 400 });
  } catch (error) {
    // Provider messages never contain the key.
    return NextResponse.json({ error: `The AI view failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}` }, { status: 502 });
  }
}
