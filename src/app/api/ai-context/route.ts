import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { parseAiProfile } from "@/lib/behaviour/ai-profile";
import { runBehaviourAnalysis } from "@/lib/behaviour/run";

export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? { supabase, userId: data.claims.sub } : null;
}

// Saves a profile written by the member's own AI assistant (the reply to the profile prompt).
export async function POST(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { source?: unknown; reply?: unknown } | null;
  const reply = typeof body?.reply === "string" ? body.reply.slice(0, 60_000) : "";
  const profile = parseAiProfile(reply, String(body?.source ?? "other"));
  if (!profile) return NextResponse.json({ error: "No profile JSON found. Paste the assistant's whole reply, including the JSON block at the end." }, { status: 422 });
  const { error } = await auth.supabase.from("ai_context_reports").insert({ user_id: auth.userId, source: profile.source, window_days: profile.windowDays, report: profile, narrative: reply });
  if (error) return NextResponse.json({ error: "The profile could not be saved." }, { status: 500 });
  // The behaviour analysis is re-run with the new profile in the background (about a minute), keeping the
  // member's earlier choice about including their own AI conversations.
  const { data: last } = await auth.supabase.from("behaviour_analyses").select("included_conversations").order("created_at", { ascending: false }).limit(1).maybeSingle();
  after(async () => { await runBehaviourAnalysis(auth.supabase, auth.userId, last?.included_conversations === true).catch(() => undefined); });
  return NextResponse.json({ ok: true, source: profile.source, findings: profile.findings.length, changes: profile.changes.length, reanalysing: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Unknown report." }, { status: 400 });
  const { error } = await auth.supabase.from("ai_context_reports").delete().eq("id", id);
  return error ? NextResponse.json({ error: "Could not delete." }, { status: 500 }) : NextResponse.json({ ok: true });
}
