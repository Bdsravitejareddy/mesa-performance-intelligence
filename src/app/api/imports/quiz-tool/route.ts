import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { parseQuizToolRow } from "@/lib/imports/quiz-tool";

// Saves one session's result read from the Cohort 4 Quiz Tool (member-approved, read-only; see AGENTS.md).
// A separately labelled source: it is never written to marks and never counted in official totals.
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Connect Supabase first." }, { status: 503 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const row = parseQuizToolRow(body ?? {});
  if ("error" in row) return NextResponse.json({ error: row.error }, { status: 400 });
  const note = String(body?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  // The same session read again replaces the earlier reading rather than adding a duplicate.
  const { error } = await supabase.from("quiz_tool_results").upsert({ user_id: data.claims.sub, ...row, note, captured_at: new Date().toISOString() }, { onConflict: "user_id,course,term,session" });
  return error ? NextResponse.json({ error: "Could not save." }, { status: 500 }) : NextResponse.json({ ok: true }, { status: 201 });
}
