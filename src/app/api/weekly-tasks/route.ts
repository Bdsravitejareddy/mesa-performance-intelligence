import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { progress, shiftWeek, weekStart } from "@/lib/weekly/score";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? supabase : null;
}

async function state(supabase: NonNullable<Awaited<ReturnType<typeof member>>>) {
  const week = weekStart();
  const since = shiftWeek(week, -12);
  const { data } = await supabase.from("weekly_tasks").select("id, week_start, title, source, reason, position, done_at, created_at").gte("week_start", since).order("position").order("created_at");
  const rows = data ?? [];
  const weeks = [...new Set(rows.map((row) => row.week_start as string))].map((value) => ({ week: value, done: rows.filter((row) => row.week_start === value && row.done_at).length, total: rows.filter((row) => row.week_start === value).length }));
  return { week, tasks: rows.filter((row) => row.week_start === week), history: weeks.sort((a, b) => a.week.localeCompare(b.week)), ...progress(weeks, week) };
}

export async function GET() {
  const supabase = await member();
  if (!supabase) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json(await state(supabase));
}

export async function POST(request: NextRequest) {
  const supabase = await member();
  if (!supabase) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { title?: unknown; source?: unknown; reason?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return NextResponse.json({ error: "Give the task a title." }, { status: 400 });
  const week = weekStart();
  const { count } = await supabase.from("weekly_tasks").select("id", { count: "exact", head: true }).eq("week_start", week);
  if ((count ?? 0) >= 5) return NextResponse.json({ error: "This week already has five tasks." }, { status: 409 });
  const { error } = await supabase.from("weekly_tasks").insert({ week_start: week, title, source: body?.source === "suggested" ? "suggested" : "self", reason: typeof body?.reason === "string" ? body.reason.slice(0, 400) : "", position: count ?? 0 });
  if (error) return NextResponse.json({ error: "Could not add the task." }, { status: 400 });
  return NextResponse.json(await state(supabase), { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await member();
  if (!supabase) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: unknown; done?: unknown } | null;
  if (typeof body?.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ error: "Unknown task." }, { status: 400 });
  const { error } = await supabase.from("weekly_tasks").update({ done_at: body.done === true ? new Date().toISOString() : null }).eq("id", body.id);
  if (error) return NextResponse.json({ error: "Could not update the task." }, { status: 400 });
  return NextResponse.json(await state(supabase));
}

export async function DELETE(request: NextRequest) {
  const supabase = await member();
  if (!supabase) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Unknown task." }, { status: 400 });
  await supabase.from("weekly_tasks").delete().eq("id", id);
  return NextResponse.json(await state(supabase));
}
