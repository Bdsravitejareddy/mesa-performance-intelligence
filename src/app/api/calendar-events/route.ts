import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { EVENT_KINDS, type EventKind } from "@/lib/calendar";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? { supabase, userId: data.claims.sub } : null;
}

// A date-time from the form's local India time ("2026-11-27T09:30"), or an ISO instant.
function instant(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+05:30` : /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T09:00:00+05:30` : value;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

// Events a member adds to the calendar (hackathons, competitions, interviews); RLS keeps them in the workspace.
export async function POST(request: NextRequest) {
  const session = await member();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  const startsAt = instant(body?.startsAt);
  const endsAt = instant(body?.endsAt);
  if (!title || !startsAt) return NextResponse.json({ error: "Give the event a title and a date." }, { status: 400 });
  if (endsAt && endsAt < startsAt) return NextResponse.json({ error: "The end is before the start." }, { status: 400 });
  const kind = EVENT_KINDS.includes(body?.kind as EventKind) ? body!.kind as EventKind : "event";
  const link = typeof body?.link === "string" && /^https:\/\/\S+$/.test(body.link.trim()) ? body.link.trim().slice(0, 1000) : null;
  const { error } = await session.supabase.from("calendar_events").insert({ user_id: session.userId, title, kind, starts_at: startsAt, ends_at: endsAt, note: typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "", link, source: "member" });
  if (error) return NextResponse.json({ error: "Could not add the event." }, { status: 400 });
  return NextResponse.json({ added: title }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await member();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  const { error } = await session.supabase.from("calendar_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not remove the event." }, { status: 400 });
  return NextResponse.json({ removed: id });
}
