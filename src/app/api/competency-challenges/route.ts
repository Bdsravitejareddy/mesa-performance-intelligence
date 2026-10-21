import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const COMPETENCY_ID = /^[a-z_]+\.[a-z_]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = new Set(["demonstrated_strength", "emerging", "meets_expectations", "development_area", "conflicting", "insufficient_evidence"]);

async function member() {
  if (!hasSupabaseConfig()) return { response: NextResponse.json({ error: "Connect Supabase to record challenges." }, { status: 503 }) };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return { response: NextResponse.json({ error: "Sign in to record challenges." }, { status: 401 }) };
  return { supabase, userId };
}

// Files a challenge against the current conclusion. The disputed state is stored so a later change is traceable.
export async function POST(request: NextRequest) {
  const auth = await member();
  if (!auth.supabase) return auth.response;
  const body = (await request.json().catch(() => null)) as { competencyId?: unknown; disputedState?: unknown; statement?: unknown; counterevidence?: unknown } | null;
  const competencyId = typeof body?.competencyId === "string" ? body.competencyId : "";
  const disputedState = typeof body?.disputedState === "string" ? body.disputedState : "";
  const statement = typeof body?.statement === "string" ? body.statement.trim() : "";
  const counterevidence = typeof body?.counterevidence === "string" ? body.counterevidence.trim() : "";
  if (!COMPETENCY_ID.test(competencyId) || !STATES.has(disputedState) || !statement || statement.length > 2000 || counterevidence.length > 4000) {
    return NextResponse.json({ error: "Explain why the conclusion is wrong (up to 2,000 characters)." }, { status: 400 });
  }
  const { data, error } = await auth.supabase.from("competency_challenges").insert({ user_id: auth.userId, competency_id: competencyId, disputed_state: disputedState, statement, counterevidence }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not record the challenge." }, { status: 400 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

// Closes a challenge. Resolving requires a note; the original statement can never be edited.
export async function PATCH(request: NextRequest) {
  const auth = await member();
  if (!auth.supabase) return auth.response;
  const body = (await request.json().catch(() => null)) as { id?: unknown; status?: unknown; resolutionNote?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const status = body?.status === "resolved" || body?.status === "withdrawn" ? body.status : null;
  const resolutionNote = typeof body?.resolutionNote === "string" ? body.resolutionNote.trim() : "";
  if (!UUID.test(id) || !status || resolutionNote.length > 2000 || (status === "resolved" && !resolutionNote)) {
    return NextResponse.json({ error: "Resolving a challenge needs a note explaining the outcome." }, { status: 400 });
  }
  const { data, error } = await auth.supabase.from("competency_challenges").update({ status, resolution_note: resolutionNote, resolved_at: new Date().toISOString() }).eq("id", id).eq("status", "open").select("id");
  if (error) return NextResponse.json({ error: "Could not update the challenge." }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "Open challenge not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
