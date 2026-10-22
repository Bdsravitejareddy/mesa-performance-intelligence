import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { evaluateOutcome } from "@/lib/roadmap/prioritise";
import { startingPoint } from "@/lib/roadmap/load";
import type { CompetencyState } from "@/lib/competency/classify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(["validate", "close_gap", "build_proof", "broaden", "resolve_conflict"]);

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return typeof userId === "string" ? { supabase, userId } : null;
}

// Adds a recommended activity to the plan, recording the competency's current state and evidence.
export async function POST(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { competencyId?: unknown; activity?: unknown; kind?: unknown; rationale?: unknown; priority?: unknown; effortHours?: unknown } | null;
  const competencyId = typeof body?.competencyId === "string" && /^[a-z_]+\.[a-z_]+$/.test(body.competencyId) ? body.competencyId : "";
  const activity = typeof body?.activity === "string" ? body.activity.trim().slice(0, 400) : "";
  if (!competencyId || !activity || !KINDS.has(String(body?.kind))) return NextResponse.json({ error: "Choose a recommended activity." }, { status: 400 });
  const start = await startingPoint(auth.supabase, competencyId);
  if (!start) return NextResponse.json({ error: "Unknown competency." }, { status: 404 });
  const { error } = await auth.supabase.from("roadmap_actions").insert({ user_id: auth.userId, competency_id: competencyId, activity, activity_kind: body!.kind, rationale: typeof body?.rationale === "string" ? body.rationale.slice(0, 1000) : "", priority: Number(body?.priority) || 0, effort_hours: Math.max(0, Number(body?.effortHours) || 0), start_state: start.state, start_evidence_fingerprint: start.fingerprint });
  if (error) return NextResponse.json({ error: "Could not add it to the plan." }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// Updates status; completing an action records its outcome from evidence added since it started.
export async function PATCH(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: unknown; status?: unknown } | null;
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : "";
  const status = ["planned", "in_progress", "done", "dropped"].includes(String(body?.status)) ? String(body?.status) : "";
  if (!id || !status) return NextResponse.json({ error: "Choose an action and a status." }, { status: 400 });
  const { data: action } = await auth.supabase.from("roadmap_actions").select("competency_id, start_state, start_evidence_fingerprint").eq("id", id).maybeSingle();
  if (!action) return NextResponse.json({ error: "Action not found." }, { status: 404 });
  const update: Record<string, unknown> = { status, completed_at: status === "done" ? new Date().toISOString() : null };
  if (status === "done") {
    const now = await startingPoint(auth.supabase, action.competency_id as string);
    if (now) { update.outcome = evaluateOutcome({ state: action.start_state as CompetencyState, evidenceFingerprint: action.start_evidence_fingerprint as string }, { state: now.state, evidenceFingerprint: now.fingerprint }); update.outcome_checked_at = new Date().toISOString(); }
  }
  const { error } = await auth.supabase.from("roadmap_actions").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not update the action." }, { status: 400 });
  return NextResponse.json({ ok: true, outcome: update.outcome ?? null });
}
