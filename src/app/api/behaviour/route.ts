import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { runBehaviourAnalysis } from "@/lib/behaviour/run";

export const maxDuration = 300;

// Runs a new behaviour analysis; earlier runs are kept for comparison.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { includeConversations?: unknown };
  const result = await runBehaviourAnalysis(supabase, userId, body.includeConversations === true);
  return result.ok ? NextResponse.json(result, { status: 201 }) : NextResponse.json({ error: result.error }, { status: result.status });
}
