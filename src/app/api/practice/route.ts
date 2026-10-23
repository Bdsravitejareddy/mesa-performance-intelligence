import { randomInt } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { buildWeek, expression, weekStart } from "@/lib/practice/week";
import { blindEvaluate } from "@/lib/quality/engine";
import { getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";

export const maxDuration = 120;

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? { supabase, userId: data.claims.sub } : null;
}

// This week's set (created on first visit, aimed at the weakest skill in the AI view). Answer keys never leave the server.
export async function GET() {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const week = weekStart(new Date());
  let { data: row } = await auth.supabase.from("weekly_practice").select("seed, focus, answers, result, submitted_at").eq("week_start", week).maybeSingle();
  if (!row) {
    const { data: view } = await auth.supabase.from("ai_skill_views").select("domains").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const weakest = Object.entries((view?.domains ?? {}) as Record<string, { score: number | null }>).filter(([, value]) => value.score !== null).sort((a, b) => a[1].score! - b[1].score!)[0]?.[0] ?? "Analytical reasoning";
    const created = await auth.supabase.from("weekly_practice").insert({ week_start: week, seed: randomInt(1, 2_147_483_647), focus: weakest }).select("seed, focus, answers, result, submitted_at").single();
    row = created.data;
  }
  if (!row) return NextResponse.json({ error: "This week's practice could not be created." }, { status: 500 });
  const { items } = buildWeek(Number(row.seed), row.focus as string);
  return NextResponse.json({ week, focus: row.focus, items, answers: row.answers, result: row.result, submitted: Boolean(row.submitted_at) });
}

// Submits the week: questions are marked against the stored keys; written answers get plain expression measures
// and, with AI consent, blind feedback on the case task and the conversational answers.
export async function PUT(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const week = weekStart(new Date());
  const { data: row } = await auth.supabase.from("weekly_practice").select("id, seed, focus, submitted_at").eq("week_start", week).maybeSingle();
  if (!row) return NextResponse.json({ error: "Open this week's practice first." }, { status: 404 });
  if (row.submitted_at) return NextResponse.json({ error: "This week's practice is already submitted." }, { status: 409 });
  const body = await request.json().catch(() => null) as { answers?: Record<string, unknown> } | null;
  const answers = Object.fromEntries(Object.entries(body?.answers ?? {}).map(([key, value]) => [key.slice(0, 10), typeof value === "number" ? value : String(value ?? "").slice(0, 4000)]));
  const { items, key, explanations } = buildWeek(Number(row.seed), row.focus as string);
  const questions = items.filter((item) => item.kind === "quiz" || item.kind === "trick").map((item) => ({ id: item.id, kind: item.kind, correct: answers[item.id] === key[item.id], key: (item as { options: string[] }).options[key[item.id]], explanation: explanations[item.id] }));
  const written = items.filter((item) => item.kind === "case" || item.kind === "conversation").map((item) => ({ id: item.id, kind: item.kind, ...expression(String(answers[item.id] ?? "")) }));
  let feedback: Record<string, string> = {};
  const config = getAIProcessingConfig();
  const { data: consent } = await auth.supabase.from("ai_processing_consents").select("disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at").eq("user_id", auth.userId).maybeSingle();
  const caseText = String(answers.case ?? "");
  if (config.configured && isAIConsentCurrent(consent, config) && caseText.split(/\s+/).length >= 30) {
    try {
      const prompt = (items.find((item) => item.id === "case") as { prompt: string }).prompt;
      const report = await blindEvaluate(caseText, { source: "model_general", label: "Weekly practice criteria", criteria: [{ name: "Answers the question asked", description: "Addresses the task directly.", weight: 2 }, { name: "Reasoning", description: "Steps follow from each other and the assumptions are visible.", weight: 2 }, { name: "Clarity", description: "Easy to follow; leads with the conclusion.", weight: 1 }] }, "written_answer", prompt);
      feedback = { case: [report.summary, ...report.dimensions.map((dimension) => dimension.improvement && `${dimension.name}: ${dimension.improvement}`).filter(Boolean)].filter(Boolean).join(" ").slice(0, 1200), caseScore: String(report.overall ?? "") };
    } catch { feedback = {}; }
  }
  const result = { questions, correct: questions.filter((item) => item.correct).length, total: questions.length, written, feedback };
  const { error } = await auth.supabase.from("weekly_practice").update({ answers, result, submitted_at: new Date().toISOString() }).eq("id", row.id);
  return error ? NextResponse.json({ error: "Could not save." }, { status: 500 }) : NextResponse.json({ result });
}
