import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestJsonFromProvider } from "@/lib/ai/provider";
import { resolveProviderSettings } from "@/lib/ai/settings";
import { getDashboardSnapshot, type OverviewBrief } from "@/lib/dashboard-data";
import { stakesOf } from "@/lib/assessments/stakes";
import type { TermChoice } from "@/lib/term";

const SYSTEM = [
  "You write the opening summary of a person's performance dashboard from computed figures only. Write to them in the second person (\"you\"), in plain everyday language, with no jargon.",
  "Interpret each course against the person's target roles using the dashboard's internal benchmarks (core 75, supporting 65, peripheral 50 — conventions of this dashboard, not employer requirements): say a mark is above or below the dashboard's benchmark for that role, never that a role 'requires' a mark. Use each role's relevanceReason when explaining why a course is core.",
  "Only recommend submitting work that appears in notSubmitted; never suggest submitting something already submitted.",
  "Never mention field names, ids or codes (such as competencyChanges or analytical.numerical_analysis); use the plain names given. Compare grades over time only within the same kind of work (byStakes), and say when the recent window is mostly practice. Describe any change as a change in average evaluated results, with the number of results on each side (e.g. \"averaged 84 across 6 exams, against 78 for 1 earlier\"); never call it an improvement or decline in ability, and say when the numbers are too few or cover different subjects.",
  "Never quote or paraphrase faculty feedback, and never restate a figure without saying what it means.",
  "Standing is the official weighted average; projectedWithAi is only an estimate including AI grades for unmarked work — never present it as the person's mark. Courses assessed via MRS are read against the cohort high (readAgainstCeiling), and courses whose results are expected later are pending, not weak. State evidence limits. A standing is settled only as far as officialShareOfCourseWeight goes: call a gap or strength confirmed only when official marks cover at least half the course weight; otherwise say it rests on the marks released so far. evidenceShareIncludingAiGrades is never a reason to call a result confirmed. A course with little of its weight demonstrated, or a standing that rests partly (basis mixed) or wholly (basis ai) on AI grades rather than official marks, is provisional. Do not speculate about what future marks must be.",
  "Be specific (course names, numbers), calibrated and brief. No flattery, no generic advice.",
  "Also write: about (two sentences on who the person is as a learner and professional, from the personality, AI skill view and thinking patterns given — tentative, no flattery); changes (up to 4 {what, evidence}: what changed in the last 30 days, each naming the figure or record behind it, from last30Days; say plainly if little changed); objectives (up to 4 {objective, status met|on_track|not_yet, detail}: the target roles and course benchmarks, using the figures given). focus is what to work on this week.",
  "Return JSON {\"headline\":string (max 14 words),\"summary\":string (max 2 sentences),\"insights\":[{\"title\":string,\"detail\":string (max 2 sentences),\"kind\":\"strength\"|\"gap\"|\"risk\"|\"opportunity\"|\"context\"}] (3 to 5),\"focus\":[string] (up to 3 concrete next steps for this week),\"about\":string,\"changes\":[{\"what\":string,\"evidence\":string}],\"objectives\":[{\"objective\":string,\"status\":string,\"detail\":string}]}.",
].join(" ");

export async function briefInput(client: SupabaseClient, term: TermChoice) {
  const snapshot = await getDashboardSnapshot(client, term);
  return {
    term,
    weightedAverage: snapshot.averageMark,
    marksReleased: snapshot.markCount,
    assessments: snapshot.assessmentCount,
    courses: snapshot.standings.map((course) => ({
      course: course.title.replace(/\s+with\s+.*$/i, ""),
      standing: course.standing, basis: course.basis, official: course.official, ai: course.ai, projectedWithAi: course.projected, readAgainstCeiling: course.relative,
      assessedVia: course.context?.assessedBy || null, resultsExpected: course.context?.expected || null, cohortHigh: course.context?.scaleMax ?? null,
      officialShareOfCourseWeight: course.officialShare, evidenceShareIncludingAiGrades: course.demonstratedShare, evidenced: `${course.evidenced}/${course.assessments}`,
      roles: course.roles.map((role) => ({ role: role.role, relevance: role.relevance, relevanceReason: role.why, benchmark: role.threshold, verdict: role.verdict })),
    })),
    competencies: snapshot.insights ? { assessed: snapshot.insights.competenciesAssessed, total: snapshot.insights.competenciesTotal, strengths: snapshot.insights.strengths, gaps: snapshot.insights.gaps } : null,
    readiness: snapshot.insights?.readiness ?? [],
    grading: snapshot.insights?.grading ?? null,
    notSubmitted: await notSubmitted(client),
    ...(await personContext(client)),
  };
}

function clean(raw: Record<string, unknown>): OverviewBrief | null {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const kinds = new Set(["strength", "gap", "risk", "opportunity", "context"]);
  const insights = (Array.isArray(raw.insights) ? raw.insights as Record<string, unknown>[] : []).map((item) => ({ title: text(item.title, 120), detail: text(item.detail, 400), kind: (kinds.has(String(item.kind)) ? item.kind : "context") as OverviewBrief["insights"][number]["kind"] })).filter((item) => item.title).slice(0, 5);
  const headline = text(raw.headline, 140);
  if (!headline || !insights.length) return null;
  const statuses = new Set(["met", "on_track", "not_yet"]);
  return { headline, summary: text(raw.summary, 400), insights, focus: (Array.isArray(raw.focus) ? raw.focus : []).map((item) => text(item, 200)).filter(Boolean).slice(0, 3),
    about: text(raw.about, 400),
    changes: (Array.isArray(raw.changes) ? raw.changes as Record<string, unknown>[] : []).map((item) => ({ what: text(item.what, 200), evidence: text(item.evidence, 240) })).filter((item) => item.what).slice(0, 4),
    objectives: (Array.isArray(raw.objectives) ? raw.objectives as Record<string, unknown>[] : []).map((item) => ({ objective: text(item.objective, 120), status: (statuses.has(String(item.status)) ? item.status : "not_yet") as "met" | "on_track" | "not_yet", detail: text(item.detail, 240) })).filter((item) => item.objective).slice(0, 4) };
}

// Generates (or reuses) the summary for a term; a new one is written only when the figures change.
export async function generateOverviewBrief(client: SupabaseClient, userId: string, term: TermChoice): Promise<{ status: "reused" | "created"; brief: OverviewBrief } | null> {
  const input = await briefInput(client, term);
  if (!input.courses.length) return null;
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const { data: existing } = await client.from("overview_briefs").select("brief").eq("term", term).eq("input_hash", inputHash).limit(1).maybeSingle();
  if (existing) return { status: "reused", brief: existing.brief as OverviewBrief };
  const brief = clean(await requestJsonFromProvider(SYSTEM, JSON.stringify(input), { timeoutMs: 60_000 }));
  if (!brief) return null;
  await client.from("overview_briefs").insert({ user_id: userId, term, input_hash: inputHash, brief, provider_model: resolveProviderSettings().model.slice(0, 120) });
  return { status: "created", brief };
}

// Assessments with no sign of a submission anywhere: no LMS submitted status, no captured page, file or link.
async function notSubmitted(client: SupabaseClient): Promise<string[]> {
  const [assessments, submissions, documents, links] = await Promise.all([
    client.from("assessments").select("id, title"),
    client.from("submissions").select("id, assessment_id, official_mark, lms_submission_status, page_capture"),
    client.from("submission_documents").select("submission_id"),
    client.from("submission_links").select("submission_id"),
  ]);
  const withEvidence = new Set([...(documents.data ?? []), ...(links.data ?? [])].map((row) => row.submission_id as string));
  const submitted = new Set((submissions.data ?? []).filter((row) => row.official_mark !== null || /submit|graded/i.test(String(row.lms_submission_status ?? "")) || /submitted|external/i.test(String((row.page_capture as { status?: string } | null)?.status ?? "")) || withEvidence.has(row.id as string)).map((row) => row.assessment_id as string));
  return (assessments.data ?? []).filter((row) => !submitted.has(row.id as string)).map((row) => row.title as string).slice(0, 30);
}

// Who the person is and what changed recently, from stored figures only: personality and context readings, the
// AI skill view, observed thinking patterns, and records dated in the last 30 days against the 30 before.
async function personContext(client: SupabaseClient) {
  const day = 86_400_000, now = Date.now();
  const [personality, skills, behaviour, snapshots, profiles, gradings, submissions, tasks] = await Promise.all([
    client.from("test_attempts").select("result").eq("kind", "personality").not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("ai_skill_views").select("domains").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("behaviour_analyses").select("dimensions").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("competency_snapshots").select("competency_id, state, recorded_at, reason, competencies(name)").gte("recorded_at", new Date(now - 30 * day).toISOString()).order("recorded_at"),
    client.from("ai_context_reports").select("report").order("created_at", { ascending: false }).limit(3),
    client.from("submission_gradings").select("submission_id, ai_score, created_at").order("created_at", { ascending: false }),
    client.from("submissions").select("id, submitted_at, page_capture, assessments(title)"),
    client.from("weekly_tasks").select("week_start, done_at").gte("week_start", new Date(now - 30 * day).toISOString().slice(0, 10)),
  ]);
  const factors = (personality.data?.result as { factors?: Record<string, { score: number }> } | null)?.factors ?? null;
  const skillView = Object.entries((skills.data?.domains ?? {}) as Record<string, { score: number | null; confidence: string }>).filter(([, value]) => value.score !== null).sort((a, b) => b[1].score! - a[1].score!);
  const observed = ((behaviour.data?.dimensions ?? []) as { dimension: string; status: string; overview?: string }[]).filter((row) => row.status === "observed").map((row) => ({ pattern: row.dimension, overview: (row.overview ?? "").slice(0, 200) }));
  // Grades of work submitted in each window (latest grading per submission), so a change compares like with like.
  const submittedAt = new Map((submissions.data ?? []).map((row) => [row.id as string, (row.page_capture as { submittedAt?: string } | null)?.submittedAt ?? (row.submitted_at as string | null)]));
  const stakesOfSubmission = new Map((submissions.data ?? []).map((row) => [row.id as string, stakesOf(String((row.assessments as unknown as { title?: string } | null)?.title ?? ""))]));
  const byStakes: Record<string, { last30: number[]; previous30: number[] }> = {};
  const seen = new Set<string>(); const recent: number[] = []; const before: number[] = [];
  for (const row of gradings.data ?? []) {
    if (seen.has(row.submission_id as string) || row.ai_score === null) continue;
    seen.add(row.submission_id as string);
    const when = Date.parse(String(submittedAt.get(row.submission_id as string) ?? "").replace(/^[A-Za-z]+day,\s*/, "").replace(" ·", ""));
    if (!Number.isFinite(when)) continue;
    (now - when <= 30 * day ? recent : now - when <= 60 * day ? before : []).push(Number(row.ai_score));
    const tier = byStakes[stakesOfSubmission.get(row.submission_id as string) ?? "graded"] ??= { last30: [], previous30: [] };
    (now - when <= 30 * day ? tier.last30 : now - when <= 60 * day ? tier.previous30 : []).push(Number(row.ai_score));
  }
  const mean = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null);
  const stateWords: Record<string, string> = { demonstrated_strength: "a demonstrated strength", emerging: "emerging", meets_expectations: "meeting expectations", development_area: "a development area", conflicting: "conflicting", insufficient_evidence: "not enough evidence yet" };
  const changedCompetencies = [...new Set((snapshots.data ?? []).filter((row) => !/rules/i.test(String(row.reason ?? ""))).map((row) => `${(row.competencies as unknown as { name?: string } | null)?.name ?? "A skill"} became ${stateWords[row.state as string] ?? row.state}`))].slice(0, 12);
  return {
    person: { personality: factors ? Object.fromEntries(Object.entries(factors).map(([factor, value]) => [factor, value.score])) : null, aiSkillView: { strongest: skillView.slice(0, 3).map(([domain, value]) => `${domain} ${value.score}`), weakest: skillView.slice(-2).map(([domain, value]) => `${domain} ${value.score}`) }, thinkingPatterns: observed.slice(0, 7) },
    last30Days: {
      blindGradesOfWorkSubmitted: { last30: { mean: mean(recent), n: recent.length }, previous30: { mean: mean(before), n: before.length }, byStakes: Object.fromEntries(Object.entries(byStakes).map(([tier, value]) => [tier, { last30: { mean: mean(value.last30), n: value.last30.length }, previous30: { mean: mean(value.previous30), n: value.previous30.length } }])) },
      skillChanges: changedCompetencies,
      changesYourAssistantsNoticed: (profiles.data ?? []).flatMap((row) => ((row.report as { changes?: { what: string; when: string }[] }).changes ?? []).map((change) => `${change.when}: ${change.what}`)).slice(0, 6),
      weeklyTasks: { done: (tasks.data ?? []).filter((row) => row.done_at).length, set: (tasks.data ?? []).length },
    },
  };
}
