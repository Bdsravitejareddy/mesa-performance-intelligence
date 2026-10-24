import { randomInt } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { buildWeek, expression, weekStart, type PracticeItem } from "@/lib/practice/week";
import { courseQuestions } from "@/lib/practice/course-questions";
import { chooseTarget, reflectionPrompt, type PracticeTarget } from "@/lib/practice/target";
import { loadCompetencyInputs } from "@/lib/competency/load";
import { buildCompetencyMap } from "@/lib/competency/map";
import { buildLibrary } from "@/lib/roles/library";
import { blindEvaluate } from "@/lib/quality/engine";
import { getAIProcessingConfig, isAIConsentCurrent } from "@/lib/ai/consent";

export const maxDuration = 200;
const TIME_LIMIT = 25 * 60;
const GRACE = 60;

async function member() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? { supabase, userId: data.claims.sub } : null;
}
type Auth = NonNullable<Awaited<ReturnType<typeof member>>>;

async function aiAllowed(auth: Auth) {
  const config = getAIProcessingConfig();
  const { data: consent } = await auth.supabase.from("ai_processing_consents").select("disclosure_version, configuration_fingerprint, provider_host, provider_model, revoked_at").eq("user_id", auth.userId).maybeSingle();
  return config.configured && isAIConsentCurrent(consent, config);
}

// The course that tests the weakest skill most (by mapped assessments), else the course with the most material.
async function chooseCourse(auth: Auth, focus: string): Promise<{ id: string; title: string } | null> {
  const [{ data: competencies }, { data: mappings }, { data: assessments }, { data: courses }] = await Promise.all([
    auth.supabase.from("competencies").select("id, domain_name"),
    auth.supabase.from("assessment_competencies").select("assessment_id, competency_id").eq("review_status", "accepted"),
    auth.supabase.from("assessments").select("id, course_id"),
    auth.supabase.from("courses").select("id, title"),
  ]);
  const inDomain = new Set((competencies ?? []).filter((row) => row.domain_name === focus).map((row) => row.id as string));
  const courseOf = new Map((assessments ?? []).map((row) => [row.id as string, row.course_id as string]));
  const counts = new Map<string, number>();
  for (const row of mappings ?? []) if (inDomain.has(row.competency_id as string)) { const course = courseOf.get(row.assessment_id as string); if (course) counts.set(course, (counts.get(course) ?? 0) + 1); }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  // Courses that hold assessments (the platform's courses); linked Drive folders supply their material.
  const assessed = new Set((assessments ?? []).map((row) => row.course_id as string));
  const candidates = (courses ?? []).filter((row) => assessed.has(row.id as string));
  const pick = candidates.find((row) => row.id === ranked[0]) ?? candidates[Math.floor(Math.random() * Math.max(1, candidates.length))];
  return pick ? { id: pick.id as string, title: pick.title as string } : null;
}

// The course that holds most of the target competency's assessments.
async function courseOfAssessments(auth: Auth, assessmentIds: string[]): Promise<{ id: string; title: string } | null> {
  if (!assessmentIds.length) return null;
  const { data: rows } = await auth.supabase.from("assessments").select("course_id").in("id", assessmentIds);
  const counts = new Map<string, number>();
  for (const row of rows ?? []) counts.set(row.course_id as string, (counts.get(row.course_id as string) ?? 0) + 1);
  const id = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!id) return null;
  const { data: course } = await auth.supabase.from("courses").select("id, title").eq("id", id).maybeSingle();
  return course ? { id: course.id as string, title: course.title as string } : null;
}

// This week's set, created on first visit: five extreme questions from your course (cross-checked), a case task
// from the same course, and two everyday prompts. Timed from when it is first opened. Keys never leave the server.
export async function GET() {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const week = weekStart(new Date());
  const select = "id, seed, focus, focus_reason, items, course_title, time_limit_seconds, answers, result, created_at, started_at, submitted_at, note";
  let { data: row } = await auth.supabase.from("weekly_practice").select(select).eq("week_start", week).maybeSingle();
  // An unstarted set without course questions (older format, or a fallback) is regenerated in place on the next visit.
  const regenerate = Boolean(row && !row.submitted_at && !row.started_at && (!row.items || !row.course_title || !row.focus_reason));
  if (!row || regenerate) {
    // The competency to work on: conflicting or weak first, then a role need with little or no signal.
    let target: PracticeTarget | null = null;
    try {
      const inputs = await loadCompetencyInputs(auth.supabase);
      const needs = new Set(buildLibrary().filter((role) => role.tier === "primary").flatMap((role) => role.requirements.flatMap((requirement) => requirement.competencyIds)));
      target = chooseTarget(buildCompetencyMap(inputs), needs);
    } catch { target = null; }
    const { data: view } = await auth.supabase.from("ai_skill_views").select("domains").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const weakestDomain = Object.entries((view?.domains ?? {}) as Record<string, { score: number | null }>).filter(([, value]) => value.score !== null).sort((a, b) => a[1].score! - b[1].score!)[0]?.[0] ?? "Analytical reasoning";
    const focus = target?.name ?? weakestDomain;
    const focusReason = target?.reason ?? `${weakestDomain} is your lowest skill in the AI view.`;
    const seed = randomInt(1, 2_147_483_647);
    const fallback = buildWeek(seed, focus);
    let items: PracticeItem[] = fallback.items;
    let key: Record<string, number> = fallback.key, explanations: Record<string, string> = fallback.explanations;
    let courseTitle = "";
    let note = "";
    const course = (target ? await courseOfAssessments(auth, target.assessmentIds) : null) ?? await chooseCourse(auth, target?.domain ?? weakestDomain);
    if (!course) note = "No course to draw questions from.";
    else if (!await aiAllowed(auth)) note = "Course questions need the current AI consent.";
    else {
      try {
        const generated = await courseQuestions(auth.supabase, course, target ? `${target.name} — ${target.description}` : focus);
        if (generated.questions.length < 3) note = `${course.title}: ${generated.note}`;
        if (generated.questions.length >= 3) {
          courseTitle = course.title;
          // Top up to five with verified extreme reasoning items if fewer course questions passed both checks.
          const fill = fallback.items.filter((item) => item.kind === "quiz" || item.kind === "trick").slice(0, 5 - generated.questions.length);
          const questionItems: PracticeItem[] = [...generated.questions.map(({ id, kind, prompt, options }) => ({ id, kind, prompt, options })), ...fill];
          key = { ...Object.fromEntries(generated.questions.map((question) => [question.id, question.answer])), ...Object.fromEntries(fill.map((item) => [item.id, fallback.key[item.id]])) };
          explanations = { ...Object.fromEntries(generated.questions.map((question) => [question.id, question.explanation])), ...Object.fromEntries(fill.map((item) => [item.id, fallback.explanations[item.id]])) };
          const caseItem: PracticeItem = { id: "case", kind: "case", prompt: generated.caseTask ?? (fallback.items.find((item) => item.kind === "case") as { prompt: string }).prompt, focus: generated.caseTask ? course.title.replace(/\s+with\s+.*$/i, "") : focus, minWords: 120 };
          items = [...questionItems, caseItem, ...fallback.items.filter((item) => item.kind === "conversation")];
          // One of the two everyday prompts becomes a reflection on the target competency.
          if (target) items = items.map((item) => (item.id === "c2" ? { ...item, prompt: reflectionPrompt(target!) } : item));
        }
      } catch (error) { note = `Course questions could not be written (${error instanceof Error ? error.message.slice(0, 120) : "error"}).`; }
    }
    const values = { week_start: week, seed, focus, focus_reason: focusReason, items, course_title: courseTitle, time_limit_seconds: TIME_LIMIT, note };
    const saved = row ? await auth.supabase.from("weekly_practice").update(values).eq("id", row.id).select(select).single() : await auth.supabase.from("weekly_practice").insert(values).select(select).single();
    row = saved.data;
    if (row) await createAdminClient().from("weekly_practice_keys").upsert({ practice_id: row.id, key, explanations }, { onConflict: "practice_id" });
  }
  if (!row) return NextResponse.json({ error: "This week's practice could not be created." }, { status: 500 });
  const items = (row.items as PracticeItem[] | null) ?? buildWeek(Number(row.seed), row.focus as string).items;
  // Until Start is pressed only the outline is sent, so the questions cannot be read before the clock runs.
  const started = Boolean(row.started_at);
  const outline = items.map((item) => ({ id: item.id, kind: item.kind }));
  return NextResponse.json({ week, focus: row.focus, course: row.course_title, items: started ? items : [], outline, note: row.note, focusReason: row.focus_reason, answers: row.answers, result: row.result, submitted: Boolean(row.submitted_at), started, startedAt: row.started_at, timeLimit: row.time_limit_seconds });
}

// Starts the clock for this week's set.
export async function POST() {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: row } = await auth.supabase.from("weekly_practice").select("id, started_at").eq("week_start", weekStart(new Date())).maybeSingle();
  if (!row) return NextResponse.json({ error: "Open this week's practice first." }, { status: 404 });
  if (!row.started_at) await auth.supabase.from("weekly_practice").update({ started_at: new Date().toISOString() }).eq("id", row.id);
  return NextResponse.json({ ok: true });
}

// Submits the week: questions are marked against the server-held keys, time over the limit is recorded, and
// written answers get plain expression measures and (with AI consent) blind feedback on the case task.
export async function PUT(request: NextRequest) {
  const auth = await member();
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const week = weekStart(new Date());
  const { data: row } = await auth.supabase.from("weekly_practice").select("id, seed, focus, items, created_at, started_at, time_limit_seconds, submitted_at").eq("week_start", week).maybeSingle();
  if (!row) return NextResponse.json({ error: "Open this week's practice first." }, { status: 404 });
  if (row.submitted_at) return NextResponse.json({ error: "This week's practice is already submitted." }, { status: 409 });
  if (!row.started_at) return NextResponse.json({ error: "Press Start first." }, { status: 409 });
  const body = await request.json().catch(() => null) as { answers?: Record<string, unknown> } | null;
  const answers = Object.fromEntries(Object.entries(body?.answers ?? {}).map(([name, value]) => [name.slice(0, 10), typeof value === "number" ? value : String(value ?? "").slice(0, 4000)]));
  const legacy = buildWeek(Number(row.seed), row.focus as string);
  const items = (row.items as PracticeItem[] | null) ?? legacy.items;
  const { data: keys } = await createAdminClient().from("weekly_practice_keys").select("key, explanations").eq("practice_id", row.id).maybeSingle();
  const key = (keys?.key as Record<string, number> | undefined) ?? legacy.key;
  const explanations = (keys?.explanations as Record<string, string> | undefined) ?? legacy.explanations;
  const seconds = Math.round((Date.now() - new Date(row.started_at as string).getTime()) / 1000);
  const questions = items.filter((item) => item.kind === "quiz" || item.kind === "trick").map((item) => ({ id: item.id, kind: item.kind, correct: answers[item.id] === key[item.id], key: (item as { options: string[] }).options[key[item.id]], explanation: explanations[item.id] ?? "" }));
  const written = items.filter((item) => item.kind === "case" || item.kind === "conversation").map((item) => ({ id: item.id, kind: item.kind, ...expression(String(answers[item.id] ?? "")) }));
  let feedback: Record<string, string> = {};
  const caseText = String(answers.case ?? "");
  if (await aiAllowed(auth) && caseText.split(/\s+/).length >= 30) {
    try {
      const prompt = (items.find((item) => item.id === "case") as { prompt: string }).prompt;
      const report = await blindEvaluate(caseText, { source: "model_general", label: "Weekly practice criteria", criteria: [{ name: "Answers the question asked", description: "Addresses the task directly.", weight: 2 }, { name: "Reasoning", description: "Steps follow from each other and the assumptions are visible.", weight: 2 }, { name: "Clarity", description: "Easy to follow; leads with the conclusion.", weight: 1 }] }, "written_answer", prompt);
      feedback = { case: [report.summary, ...report.dimensions.map((dimension) => dimension.improvement && `${dimension.name}: ${dimension.improvement}`).filter(Boolean)].filter(Boolean).join(" ").slice(0, 1200), caseScore: String(report.overall ?? "") };
    } catch { feedback = {}; }
  }
  const limit = Number(row.time_limit_seconds ?? TIME_LIMIT);
  const result = { questions, correct: questions.filter((item) => item.correct).length, total: questions.length, written, feedback, seconds, overtime: seconds > limit + GRACE };
  const { error } = await auth.supabase.from("weekly_practice").update({ answers, result, submitted_at: new Date().toISOString() }).eq("id", row.id);
  return error ? NextResponse.json({ error: "Could not save." }, { status: 500 }) : NextResponse.json({ result });
}
