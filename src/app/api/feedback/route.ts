import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { rebuildFeedbackItems } from "@/lib/feedback/repository";

async function member() {
  if (!hasSupabaseConfig()) return { error: NextResponse.json({ error: "Connect Supabase first." }, { status: 503 }) };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  return { supabase };
}

// Rebuilds the feedback repository from its sources (official feedback and AI grades) under the member's session.
export async function POST() {
  const auth = await member();
  if ("error" in auth) return auth.error;
  return NextResponse.json(await rebuildFeedbackItems(auth.supabase));
}

// Marks a point addressed (or open again). The mark survives rebuilds.
export async function PATCH(request: NextRequest) {
  const auth = await member();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as { id?: unknown; ids?: unknown; addressed?: unknown } | null;
  // One row on the page can be the same comment from several sources; all of them are marked together.
  const ids = Array.isArray(body?.ids) ? body.ids : [body?.id];
  if (!ids.length || ids.length > 50 || !ids.every((id) => typeof id === "string") || typeof body?.addressed !== "boolean") return NextResponse.json({ error: "Give the point and whether it is addressed." }, { status: 400 });
  const { error } = await auth.supabase.from("feedback_items").update({ addressed_at: body.addressed ? new Date().toISOString() : null }).in("id", ids as string[]);
  return error ? NextResponse.json({ error: "Could not save." }, { status: 500 }) : NextResponse.json({ ok: true });
}
