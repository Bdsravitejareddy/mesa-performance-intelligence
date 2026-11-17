import { createHash } from "node:crypto";
import { neoSummaryText, type IpipNeo } from "@/lib/tests/ipip-neo";
import { DUE_ZONE, dayOf, isSubmitted, kindOf } from "@/lib/due";
import { datedEvents, type MessageRow } from "@/lib/message-dates";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestJsonFromProvider } from "@/lib/ai/provider";
import { resolveProviderSettings } from "@/lib/ai/settings";
import { getDashboardSnapshot, type OverviewBrief } from "@/lib/dashboard-data";
import { stakesOf } from "@/lib/assessments/stakes";
import type { TermChoice } from "@/lib/term";

export const BRIEF_RULES_VERSION = "brief-v7-2026-11-17";
const SYSTEM = [
  "You write the opening summary of a person's performance dashboard from computed figures only. Write to them in the second person (\"you\"), in plain everyday language, with no jargon.",
  "Interpret each course against the person's target roles using the dashboard's internal benchmarks (core 75, supporting 65, peripheral 50 — conventions of this dashboard, not employer requirements): say a mark is above or below the dashboard's benchmark for that role, never that a role 'requires' a mark. Use each role's relevanceReason when explaining why a course is core.",
  "Only recommend submitting work that appears in notSubmitted; never suggest submitting something already submitted.",
  "focus must start with anything in dueThisWeek, exams first, naming the day (e.g. 'Operations mid-term written exam today'); then add study or improvement steps.",
  "When officialTermResults is given for a term, that term is finished: its course percentages, grades and GPA are the official results. Use them for that term's courses, never call those courses provisional or pending, and never contradict them with assessment-level figures.",
  "In changes, official marks (officialMarksReleased) and AI grades (aiGradesOfWorkSubmittedNotOfficialMarks) are different things: call AI grades 'AI-graded' or 'AI estimates', never marks or 'you averaged'; prefer official marks when both exist.",
  "Never mention field names, ids or codes (such as competencyChanges or analytical.numerical_analysis); use the plain names given. Compare grades over time only within the same kind of work (byStakes), and say when the recent window is mostly practice. Describe any change as a change in average evaluated results, with the number of results on each side (e.g. \"averaged 84 across 6 exams, against 78 for 1 earlier\"); never call it an improvement or decline in ability, and say when the numbers are too few or cover different subjects.",
  "Never quote or paraphrase faculty feedback, and never restate a figure without saying what it means.",
  "Standing is the official weighted average; projectedWithAi is only an estimate including AI grades for unmarked work — never present it as the person's mark. Courses assessed via MRS are read against the cohort high (readAgainstCeiling), and courses whose results are expected later are pending, not weak. State evidence limits. A standing is settled only as far as officialShareOfCourseWeight goes: call a gap or strength confirmed only when official marks cover at least half the course weight; otherwise say it rests on the marks released so far. evidenceShareIncludingAiGrades is never a reason to call a result confirmed. A course with little of its weight demonstrated, or a standing that rests partly (basis mixed) or wholly (basis ai) on AI grades rather than official marks, is provisional. Do not speculate about what future marks must be.",
  "Be specific (course names, numbers), calibrated and brief. No flattery, no generic advice.",
  "Also write: about (two sentences on who the person is as a learner and professional, from the personality, AI skill view and thinking patterns given — tentative, no flattery; personality figures are the person's own questionnaire answers, so phrase them as how they describe themselves (\"you describe yourself as…\"), never as fact; when bigFiveWithFacets is given, name its most distinctive traits by percentile — the ones furthest from the 50th — and never leave out the most extreme one; the 1–5 questionnaire scores have no norms, so do not rank traits by them); changes (up to 4 {what, evidence}: what changed in the last 30 days, each naming the figure or record behind it, from last30Days; say plainly if little changed); objectives (up to 4 {objective, status met|on_track|not_yet, detail}: the target roles and course benchmarks, using the figures given). focus is what to work on this week.",
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
    dueThisWeek: await dueSoon(client),
    officialTermResults: (snapshot.official ?? []).map((row) => ({ term: row.term, gpa: row.gpa, grade: row.grade, courseAverage: row.average, courses: row.courses.map((course) => ({ course: course.course.replace(/\s+with\s+.*$/i, ""), percentage: course.percentage, grade: course.grade })) })),
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

// When the inputs to "About you" last changed: the questionnaire, an imported personality result, the behaviour
// analysis and the AI skill view. A summary older than this may not reflect them.
export async function newestProfileInput(client: SupabaseClient): Promise<string | null> {
  const latest = (rows: { at: unknown }[] | null) => rows?.[0]?.at as string | undefined;
  const [tests, external, behaviour, skills] = await Promise.all([
    client.from("test_attempts").select("at:submitted_at").eq("kind", "personality").not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(1),
    client.from("external_assessments").select("at:created_at").order("created_at", { ascending: false }).limit(1),
    client.from("behaviour_analyses").select("at:created_at").order("created_at", { ascending: false }).limit(1),
    client.from("ai_skill_views").select("at:created_at").order("created_at", { ascending: false }).limit(1),
  ]);
  const times = [tests.data, external.data, behaviour.data, skills.data].map((rows) => latest(rows as { at: unknown }[] | null)).filter((value): value is string => Boolean(value));
  return times.length ? times.sort().at(-1)! : null;
}

// Generates (or reuses) the summary for a term; a new one is written only when the figures change.
export async function generateOverviewBrief(client: SupabaseClient, userId: string, term: TermChoice, options: { notBefore?: string | null } = {}): Promise<{ status: "reused" | "created"; brief: OverviewBrief } | null> {
  const input = await briefInput(client, term);
  if (!input.courses.length) return null;
  // The rules version is part of the key: changing the instructions must produce a new summary, not reuse one.
  const inputHash = createHash("sha256").update(JSON.stringify({ input, rules: BRIEF_RULES_VERSION, prompt: SYSTEM })).digest("hex");
  const { data: existing } = await client.from("overview_briefs").select("brief, created_at, provider_model").eq("term", term).eq("input_hash", inputHash).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) {
    // Unchanged inputs: the same summary stands. If it predates the newest inputs, a copy is stored (no AI call) so
    // the page knows it is current and stops offering to rewrite it.
    if (options.notBefore && String(existing.created_at) < options.notBefore) await client.from("overview_briefs").insert({ user_id: userId, term, input_hash: inputHash, brief: existing.brief, provider_model: String(existing.provider_model ?? "") });
    return { status: "reused", brief: existing.brief as OverviewBrief };
  }
  const brief = clean(await requestJsonFromProvider(SYSTEM, JSON.stringify(input), { timeoutMs: 60_000 }));
  if (!brief) return null;
  await client.from("overview_briefs").insert({ user_id: userId, term, input_hash: inputHash, brief: { ...brief, rulesVersion: BRIEF_RULES_VERSION }, provider_model: resolveProviderSettings().model.slice(0, 120) });
  return { status: "created", brief };
}

// Assessments with no sign of a submission anywhere: no LMS submitted status, no captured page, file or link.
// Work that can still be submitted: no submission on record (by the same reading as the Due page), in a course whose
// term is not closed by a report card, and not long past its deadline. Telling someone to submit work from a
// finished term, or a quiz they submitted late, is wrong advice.
async function notSubmitted(client: SupabaseClient): Promise<string[]> {
  const [assessments, submissions, documents, links, courses, cards] = await Promise.all([
    client.from("assessments").select("id, title, course_id, due_at"),
    client.from("submissions").select("id, assessment_id, official_mark, lms_submission_status, submitted_at, page_capture"),
    client.from("submission_documents").select("submission_id"),
    client.from("submission_links").select("submission_id"),
    client.from("courses").select("id, term"),
    client.from("lms_report_cards").select("term"),
  ]);
  const withEvidence = new Set([...(documents.data ?? []), ...(links.data ?? [])].map((row) => row.submission_id as string));
  const submitted = new Set((submissions.data ?? []).filter((row) => isSubmitted(row) || /submitted|external/i.test(String((row.page_capture as { status?: string } | null)?.status ?? "")) || withEvidence.has(row.id as string)).map((row) => row.assessment_id as string));
  const closedTerms = new Set((cards.data ?? []).map((row) => row.term as string));
  const termOf = new Map((courses.data ?? []).map((row) => [row.id as string, row.term as string | null]));
  const cutoff = Date.now() - 7 * 86_400_000;
  return (assessments.data ?? [])
    .filter((row) => !submitted.has(row.id as string) && !closedTerms.has(termOf.get(row.course_id as string) ?? "") && (!row.due_at || Date.parse(row.due_at as string) >= cutoff))
    .map((row) => row.title as string).slice(0, 30);
}

// Deadlines, exams and sessions in the next seven days (India dates): unsubmitted Nexus assignments and what Nexus
// announcements name, so the week's focus starts with what is actually due.
async function dueSoon(client: SupabaseClient): Promise<{ what: string; kind: string; when: string; course: string }[]> {
  const [assessments, submissions, messages] = await Promise.all([
    client.from("assessments").select("id, title, due_at, courses(title)").not("due_at", "is", null),
    client.from("submissions").select("assessment_id, official_mark, lms_submission_status, submitted_at"),
    client.from("lms_messages").select("id, kind, title, body, course, posted_at").order("posted_at", { ascending: false, nullsFirst: false }).limit(300),
  ]);
  const today = dayOf(new Date());
  const weekEnd = dayOf(new Date(Date.now() + 7 * 86_400_000));
  const inWeek = (at: string) => dayOf(at) >= today && dayOf(at) <= weekEnd;
  const done = new Set((submissions.data ?? []).filter((row) => isSubmitted(row)).map((row) => row.assessment_id as string));
  const when = (at: string, allDay = false) => new Date(at).toLocaleString("en-IN", { timeZone: DUE_ZONE, weekday: "short", day: "numeric", month: "short", ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }) });
  const items = [
    ...(assessments.data ?? []).filter((row) => !done.has(row.id as string) && inWeek(row.due_at as string)).map((row) => ({ what: row.title as string, kind: kindOf(row.title as string), when: when(row.due_at as string), course: String((row.courses as unknown as { title?: string } | null)?.title ?? "").replace(/\s+with\s+.*$/i, ""), at: row.due_at as string })),
    ...datedEvents((messages.data ?? []) as MessageRow[]).filter((event) => inWeek(event.at)).map((event) => ({ what: event.title, kind: event.kind, when: when(event.at, event.allDay), course: event.course.replace(/\s+with\s+.*$/i, ""), at: event.at })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 10).map(({ what, kind, when: date, course }) => ({ what, kind, when: date, course }));
}

// Who the person is and what changed recently, from stored figures only: personality and context readings, the
// AI skill view, observed thinking patterns, and records dated in the last 30 days against the 30 before.
async function personContext(client: SupabaseClient) {
  const day = 86_400_000, now = Date.now();
  const [personality, skills, behaviour, snapshots, profiles, gradings, submissions, tasks, neoRow, officialMarks] = await Promise.all([
    client.from("test_attempts").select("result").eq("kind", "personality").not("submitted_at", "is", null).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("ai_skill_views").select("domains").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("behaviour_analyses").select("dimensions").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("competency_snapshots").select("competency_id, state, recorded_at, reason, competencies(name)").gte("recorded_at", new Date(now - 30 * day).toISOString()).order("recorded_at"),
    client.from("ai_context_reports").select("report").order("created_at", { ascending: false }).limit(3),
    client.from("submission_gradings").select("submission_id, ai_score, created_at").order("created_at", { ascending: false }),
    client.from("submissions").select("id, submitted_at, page_capture, assessments(title, counts_toward_grade)"),
    client.from("weekly_tasks").select("week_start, done_at").gte("week_start", new Date(now - 30 * day).toISOString().slice(0, 10)),
    client.from("external_assessments").select("result").eq("kind", "ipip_neo").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("submissions").select("official_mark, source_updated_at, created_at").not("official_mark", "is", null),
  ]);
  const factors = (personality.data?.result as { factors?: Record<string, { score: number }> } | null)?.factors ?? null;
  const skillView = Object.entries((skills.data?.domains ?? {}) as Record<string, { score: number | null; confidence: string }>).filter(([, value]) => value.score !== null).sort((a, b) => b[1].score! - a[1].score!);
  const observed = ((behaviour.data?.dimensions ?? []) as { dimension: string; status: string; overview?: string }[]).filter((row) => row.status === "observed").map((row) => ({ pattern: row.dimension, overview: (row.overview ?? "").slice(0, 200) }));
  // Grades of work submitted in each window (latest grading per submission), so a change compares like with like.
  const submittedAt = new Map((submissions.data ?? []).map((row) => [row.id as string, (row.page_capture as { submittedAt?: string } | null)?.submittedAt ?? (row.submitted_at as string | null)]));
  const stakesOfSubmission = new Map((submissions.data ?? []).map((row) => [row.id as string, stakesOf(String((row.assessments as unknown as { title?: string } | null)?.title ?? ""), (row.assessments as unknown as { counts_toward_grade?: boolean } | null)?.counts_toward_grade ?? true)]));
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
  // Official marks released in each window, by when the mark came in, kept apart from the AI grades above.
  const officialRecent: number[] = []; const officialBefore: number[] = [];
  for (const row of officialMarks.data ?? []) {
    const at = Date.parse(String(row.source_updated_at ?? row.created_at ?? ""));
    if (!Number.isFinite(at) || row.official_mark === null) continue;
    (now - at <= 30 * day ? officialRecent : now - at <= 60 * day ? officialBefore : []).push(Number(row.official_mark));
  }
  const stateWords: Record<string, string> = { demonstrated_strength: "a demonstrated strength", emerging: "emerging", meets_expectations: "meeting expectations", development_area: "a development area", conflicting: "conflicting", insufficient_evidence: "not enough evidence yet" };
  const changedCompetencies = [...new Set((snapshots.data ?? []).filter((row) => !/rules/i.test(String(row.reason ?? ""))).map((row) => `${(row.competencies as unknown as { name?: string } | null)?.name ?? "A skill"} became ${stateWords[row.state as string] ?? row.state}`))].slice(0, 12);
  return {
    person: { personality: factors ? { scale: "self-report, 1–5 answer scale, 3 = neutral, no norms", scores: Object.fromEntries(Object.entries(factors).map(([factor, value]) => [factor, value.score])) } : null, bigFiveWithFacets: neoRow.data?.result ? neoSummaryText(neoRow.data.result as IpipNeo) : null, aiSkillView: { strongest: skillView.slice(0, 3).map(([domain, value]) => `${domain} ${value.score}`), weakest: skillView.slice(-2).map(([domain, value]) => `${domain} ${value.score}`) }, thinkingPatterns: observed.slice(0, 7) },
    last30Days: {
      officialMarksReleased: { last30: { mean: mean(officialRecent), n: officialRecent.length }, previous30: { mean: mean(officialBefore), n: officialBefore.length } },
      aiGradesOfWorkSubmittedNotOfficialMarks: { last30: { mean: mean(recent), n: recent.length }, previous30: { mean: mean(before), n: before.length }, byStakes: Object.fromEntries(Object.entries(byStakes).map(([tier, value]) => [tier, { last30: { mean: mean(value.last30), n: value.last30.length }, previous30: { mean: mean(value.previous30), n: value.previous30.length } }])) },
      skillChanges: changedCompetencies,
      changesYourAssistantsNoticed: (profiles.data ?? []).flatMap((row) => ((row.report as { changes?: { what: string; when: string }[] }).changes ?? []).map((change) => `${change.when}: ${change.what}`)).slice(0, 6),
      weeklyTasks: { done: (tasks.data ?? []).filter((row) => row.done_at).length, set: (tasks.data ?? []).length },
    },
  };
}
