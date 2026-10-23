import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { runContextReading } from "@/lib/tests/context-reading";

export const maxDuration = 120;

// Re-reads personality from the member's written context on request.
export async function POST() {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const result = await runContextReading(supabase, userId);
    return result.ok ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: result.error }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "The reading failed; try again." }, { status: 502 });
  }
}
