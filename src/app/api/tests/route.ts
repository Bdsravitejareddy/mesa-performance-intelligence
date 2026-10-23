import { randomInt } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { generateLeveledTest, LEVEL_SECONDS, LEVELS, levelOf, publicItems, scoreReasoning, versionFor, type Level } from "@/lib/tests/reasoning";
import { generatePersonalityForm, PERSONALITY_RANDOM_VERSION, scorePersonality, scorePersonalityForm } from "@/lib/tests/personality";

import { refreshReadings } from "@/lib/behaviour/refresh";

export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRACE_SECONDS = 60;

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return typeof userId === "string" ? { supabase, userId } : null;
}

// Starts an attempt. Reasoning items come from a fresh server-side seed; answers never leave the server.
export async function POST(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown; level?: unknown } | null;
  const level: Level = LEVELS.includes(body?.level as Level) ? body!.level as Level : "standard";
  if (body?.kind !== "reasoning" && body?.kind !== "personality") return NextResponse.json({ error: "Choose a test." }, { status: 400 });
  // Both tests are drawn fresh from a server-side seed: reasoning items, and which questionnaire statements appear in what order.
  const seed = randomInt(1, 2_147_483_647);
  const { data, error } = await auth.supabase.from("test_attempts").insert({ user_id: auth.userId, kind: body.kind, version: body.kind === "reasoning" ? versionFor(level) : PERSONALITY_RANDOM_VERSION, seed }).select("id, started_at").single();
  if (error || !data) return NextResponse.json({ error: "The test could not be started." }, { status: 500 });
  return NextResponse.json(body.kind === "reasoning"
    ? { attemptId: data.id, kind: "reasoning", level, seconds: LEVEL_SECONDS[level], items: publicItems(generateLeveledTest(seed, level)) }
    : { attemptId: data.id, kind: "personality", items: generatePersonalityForm(seed).map(({ id, text }) => ({ id, text })) }, { status: 201 });
}

// Submits answers. Reasoning is scored against the key regenerated from the stored seed; time over the limit is recorded.
export async function PUT(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { attemptId?: unknown; answers?: unknown; note?: unknown } | null;
  const attemptId = typeof body?.attemptId === "string" && UUID.test(body.attemptId) ? body.attemptId : "";
  const answers = body?.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? Object.fromEntries(Object.entries(body.answers as Record<string, unknown>).filter(([key, value]) => /^[a-z]+-?\d{1,2}$|^p\d{1,2}$/.test(key) && Number.isInteger(value)).map(([key, value]) => [key, Number(value)])) : null;
  if (!attemptId || !answers) return NextResponse.json({ error: "Send the attempt and answers." }, { status: 400 });
  const { data: attempt } = await auth.supabase.from("test_attempts").select("id, kind, version, seed, started_at, submitted_at").eq("id", attemptId).maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  if (attempt.submitted_at) return NextResponse.json({ error: "This attempt was already submitted." }, { status: 409 });
  const duration = Math.round((Date.now() - new Date(attempt.started_at as string).getTime()) / 1000);
  const result = attempt.kind === "reasoning"
    ? { ...scoreReasoning(generateLeveledTest(Number(attempt.seed), levelOf(attempt.version as string)), answers), level: levelOf(attempt.version as string), overtime: duration > LEVEL_SECONDS[levelOf(attempt.version as string)] + GRACE_SECONDS, seconds: duration }
    : attempt.version === PERSONALITY_RANDOM_VERSION ? scorePersonalityForm(Number(attempt.seed), answers, typeof body?.note === "string" ? body.note : "") : scorePersonality(answers);
  if (attempt.kind === "personality" && !(result as { complete: boolean }).complete) return NextResponse.json({ error: "Answer every statement." }, { status: 400 });
  const { error } = await auth.supabase.from("test_attempts").update({ answers, result, submitted_at: new Date().toISOString(), duration_seconds: duration }).eq("id", attemptId);
  if (error) return NextResponse.json({ error: "The result could not be saved." }, { status: 500 });
  // A new questionnaire (and its note) feeds the behaviour analysis and the context reading; both refresh in the background.
  if (attempt.kind === "personality") after(() => refreshReadings(auth.supabase, auth.userId));
  return NextResponse.json({ result });
}

