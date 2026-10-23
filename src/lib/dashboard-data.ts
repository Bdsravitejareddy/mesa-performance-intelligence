import { demoData, demoMarkSeries } from "@/lib/demo-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { describeSyncHealth, type SyncHealth, type SyncRun } from "@/lib/lms/sync-health";
import { loadCompetencyInputs } from "@/lib/competency/load";
import { buildCompetencyMap } from "@/lib/competency/map";
import { buildLibrary } from "@/lib/roles/library";
import { importanceFromLibrary, roleReadiness } from "@/lib/roles/readiness";
import { STAKES_WEIGHT, stakesOf } from "@/lib/assessments/stakes";
import { recommend } from "@/lib/roadmap/prioritise";
import { toRoadmapInput } from "@/lib/roadmap/load";
import { courseStanding, type CourseStanding } from "@/lib/insights/course-standing";
import { inTerm, type TermChoice } from "@/lib/term";

export type OverviewBrief = { headline: string; summary: string; insights: { title: string; detail: string; kind: "strength" | "gap" | "risk" | "opportunity" | "context" }[]; focus: string[] };

export type DashboardSnapshot = {
  demoMode: boolean;
  courses: { id: string; code: string; title: string; term: string; materials?: number }[];
  marks: { id: string; title: string; course: string; date: string; mark: number; format: string; weight?: number; courseId?: string }[];
  markSeries: { label: string; value: number }[];
  // Mean of every official mark weighted by each assessment's original maximum marks; null when no marks exist.
  averageMark: number | null;
  unweightedAverage: number | null;
  coursePerformance: { course: string; weighted: number | null; marked: number; total: number; maxMarks: number }[];
  markCount: number;
  // value is null when a topic has no scored evidence; never coerce that to 0.
  mastery: { topic: string; value: number | null; state: string }[];
  assessmentCount: number;
  topicCount: number;
  syncHealth: SyncHealth | null;
  term: TermChoice;
  standings: CourseStanding[];
  brief: { brief: OverviewBrief; createdAt: string; model: string } | null;
  insights: { markedAssessments: number; competenciesAssessed: number; competenciesTotal: number; strengths: number; gaps: number; readiness: { role: string; evidenced: number; total: number }[]; focus: { title: string; why: string; tag: string }[]; grading: { graded: number; compared: number; close: number; meanGap: number | null } | null } | null;
};

const demoSnapshot: DashboardSnapshot = {
  demoMode: true,
  courses: demoData.courses.map((course) => ({ ...course, term: "Illustrative term" })),
  marks: demoData.assessments.map((assessment) => ({
    id: assessment.id,
    title: assessment.title,
    course: assessment.course,
    date: assessment.date,
    mark: assessment.mark,
    format: assessment.format,
  })),
  markSeries: demoMarkSeries,
  averageMark: averageOf(demoData.assessments.map((assessment) => assessment.mark)),
  unweightedAverage: averageOf(demoData.assessments.map((assessment) => assessment.mark)),
  coursePerformance: [...new Set(demoData.assessments.map((assessment) => assessment.course))].map((course) => { const rows = demoData.assessments.filter((assessment) => assessment.course === course); return { course, weighted: averageOf(rows.map((row) => row.mark)), marked: rows.length, total: rows.length, maxMarks: rows.length * 100 }; }),
  markCount: demoData.assessments.length,
  mastery: demoData.mastery,
  assessmentCount: 12,
  topicCount: 11,
  syncHealth: null,
  term: "all",
  standings: [],
  brief: null,
  insights: null,
};

export async function getDashboardSnapshot(client?: SupabaseClient, term: TermChoice = "all"): Promise<DashboardSnapshot> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return demoSnapshot;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase is not configured. Connect the private workspace before loading dashboard records.");
  }

  const supabase = client ?? await createClient();
  const [courseResult, assessmentResult, submissionResult, competencyResult, syncResult] = await Promise.all([
    supabase.from("courses").select("id, code, title, term").order("created_at", { ascending: false }),
    supabase.from("assessments").select("id, course_id, title, assessment_format, due_at, official_max_mark"),
    supabase.from("submissions").select("id, assessment_id, official_mark, source_original_max_mark, submitted_at").not("official_mark", "is", null).order("submitted_at", { ascending: false }),
    supabase.from("topic_competencies").select("topic, state, score"),
    supabase.from("sync_runs").select("status, started_at, finished_at, message").eq("source_name", "Mesa Nexus MCP").order("started_at", { ascending: false }).limit(20),
  ]);

  const error = courseResult.error ?? assessmentResult.error ?? submissionResult.error ?? competencyResult.error ?? syncResult.error;
  if (error) throw new Error("Could not load the private workspace. Check the Supabase migration and project configuration.");

  // The selected term narrows courses, and with them assessments and marks; "all" keeps everything.
  const courses = (courseResult.data ?? []).filter((course) => inTerm(term, course.term as string | null));
  const termCourseIds = new Set(courses.map((course) => course.id as string));
  const assessments = (assessmentResult.data ?? []).filter((assessment) => termCourseIds.has(assessment.course_id as string));
  const assessmentById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const submissions = (submissionResult.data ?? []).filter((submission) => assessmentById.has(submission.assessment_id));
  const marks = submissions.map((submission) => {
    const assessment = assessmentById.get(submission.assessment_id);
    const course = assessment ? courseById.get(assessment.course_id) : undefined;
    return {
      id: submission.id,
      title: assessment?.title ?? "Assessment",
      course: course?.title ?? "Course",
      date: submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString("en", { day: "2-digit", month: "short" }) : "Date unavailable",
      mark: Number(submission.official_mark),
      format: assessment?.assessment_format ?? "Assessment",
      // Original LMS maximum; marks entered on the 0–100 scale weigh as 100.
      // Maximum marks times stakes: a term exam counts three times a practice task of the same size.
      weight: (submission.source_original_max_mark === null || submission.source_original_max_mark === undefined ? 100 : Number(submission.source_original_max_mark)) * STAKES_WEIGHT[stakesOf(assessment?.title ?? "")],
      courseId: assessment?.course_id ?? "",
    };
  });

  const chronological = [...marks].reverse();
  const markSeries = chronological.slice(-12).map((item) => ({ label: item.date, value: item.mark }));
  const competencies = (competencyResult.data ?? []).map((item) => ({
    topic: item.topic,
    value: item.score === null ? null : Number(item.score),
    state: stateLabel(item.state),
  }));

  return {
    demoMode: false,
    courses: courses.map((course) => ({ ...course, term: course.term ?? "" })),
    marks: marks.slice(0, 6),
    markSeries,
    averageMark: weightedAverage(marks),
    unweightedAverage: averageOf(marks.map((item) => item.mark)),
    coursePerformance: courses.map((course) => {
      const courseMarks = marks.filter((item) => item.courseId === course.id);
      return { course: course.title, weighted: weightedAverage(courseMarks), marked: courseMarks.length, total: assessments.filter((assessment) => assessment.course_id === course.id).length, maxMarks: courseMarks.reduce((sum, item) => sum + item.weight, 0) };
    }).filter((row) => row.total > 0).sort((a, b) => (b.weighted ?? -1) - (a.weighted ?? -1)),
    markCount: marks.length,
    mastery: competencies.slice(0, 6),
    assessmentCount: assessments.length,
    topicCount: competencies.length,
    syncHealth: describeSyncHealth((syncResult.data ?? []) as SyncRun[]),
    term,
    standings: await loadStandings(supabase, courses as { id: string; title: string; term: string | null }[], assessments as { id: string; course_id: string; official_max_mark: number | null; title: string }[]),
    brief: await latestBrief(supabase, term),
    insights: await buildInsights(supabase, new Set(submissions.map((row) => row.assessment_id as string)).size),
  };
}

function stateLabel(state: string): string {
  const labels: Record<string, string> = {
    not_yet_taught: "Not yet taught",
    taught_not_assessed: "Taught · not assessed",
    insufficient_evidence: "Insufficient evidence",
    demonstrated: "Demonstrated",
    development_needed: "Development needed",
  };
  return labels[state] ?? "Insufficient evidence";
}

export function averageOf(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

// Each mark counts in proportion to the marks it was out of (e.g. a 40-mark paper counts twice a 20-mark one).
export function weightedAverage(rows: { mark: number; weight: number }[]): number | null {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!rows.length || total <= 0) return null;
  return Math.round((rows.reduce((sum, row) => sum + row.mark * row.weight, 0) / total) * 10) / 10;
}

// Competency coverage, Stage 1 readiness and the top roadmap actions, from the same evidence model as the other pages.
async function buildInsights(supabase: SupabaseClient, markedAssessments: number): Promise<DashboardSnapshot["insights"]> {
  try {
    const inputs = await loadCompetencyInputs(supabase);
    const entries = buildCompetencyMap(inputs).flatMap((domain) => domain.competencies.map((entry) => ({ ...entry, domain: domain.name })));
    const states = new Map(entries.map((entry) => [entry.id, { state: entry.assessment.state, name: entry.name }]));
    const library = buildLibrary();
    // The same inputs as the Career page, including supported and attested resume claims, so both agree.
    const { data: claimRows } = await supabase.from("professional_claims").select("competency_id, status").not("competency_id", "is", null);
    const claims = (claimRows ?? []).map((row) => ({ competencyId: row.competency_id as string, status: row.status as string }));
    const readiness = library.filter((role) => role.tier === "primary").map((role) => roleReadiness(role, states, claims));
    const importance = importanceFromLibrary(library, new Map(entries.map((entry) => [entry.id, entry.mappedAssessments])));
    const focus = recommend(entries.map(toRoadmapInput), importance, new Set(), 3).map((item) => ({ title: item.activity.title, why: item.activity.why, tag: item.competency }));
    return {
      markedAssessments,
      competenciesAssessed: entries.filter((entry) => entry.assessment.why.evidence.some((row) => row.mark !== null)).length,
      competenciesTotal: entries.length,
      strengths: entries.filter((entry) => entry.assessment.state === "demonstrated_strength").length,
      gaps: entries.filter((entry) => entry.assessment.state === "development_area").length,
      readiness: readiness.map((item) => ({ role: item.role.name, evidenced: item.evidenced, total: item.skillRequirements })),
      focus,
      grading: await gradingSummary(supabase),
    };
  } catch {
    return null;
  }
}

// Latest grading per submission: how often the blind AI lands close to the official mark.
async function gradingSummary(supabase: SupabaseClient): Promise<{ graded: number; compared: number; close: number; meanGap: number | null } | null> {
  const { data, error } = await supabase.from("submission_gradings").select("submission_id, ai_score, official_mark, created_at").order("created_at", { ascending: false });
  if (error) return null;
  const latest = new Map<string, { ai: number | null; official: number | null }>();
  for (const row of data ?? []) if (!latest.has(row.submission_id as string)) latest.set(row.submission_id as string, { ai: row.ai_score === null ? null : Number(row.ai_score), official: row.official_mark === null ? null : Number(row.official_mark) });
  const pairs = [...latest.values()].filter((row) => row.ai !== null && row.official !== null).map((row) => Math.abs(row.ai! - row.official!));
  return { graded: latest.size, compared: pairs.length, close: pairs.filter((gap) => gap <= 7.5).length, meanGap: pairs.length ? Math.round((pairs.reduce((sum, gap) => sum + gap, 0) / pairs.length) * 10) / 10 : null };
}

async function loadStandings(supabase: SupabaseClient, courses: { id: string; title: string; term: string | null }[], assessments: { id: string; course_id: string; official_max_mark: number | null; title: string }[]): Promise<CourseStanding[]> {
  try {
    const ids = assessments.map((row) => row.id);
    const [gradings, mappings, submissions, contexts] = await Promise.all([
      supabase.from("submission_gradings").select("assessment_id, ai_score, created_at").order("created_at", { ascending: false }),
      supabase.from("assessment_competencies").select("assessment_id, competency_id"),
      supabase.from("submissions").select("id, assessment_id, official_mark, source_original_max_mark").not("official_mark", "is", null),
      supabase.from("course_context").select("course_id, assessed_by, expected, scale_max, note"),
    ]);
    const contextOf = new Map((contexts.data ?? []).map((row) => [row.course_id as string, { assessedBy: row.assessed_by as string, expected: row.expected as string, scaleMax: row.scale_max === null ? null : Number(row.scale_max), note: row.note as string }]));
    const latest = new Map<string, number | null>();
    for (const row of gradings.data ?? []) if (!latest.has(row.assessment_id as string)) latest.set(row.assessment_id as string, row.ai_score === null ? null : Number(row.ai_score));
    return courseStanding({
      courses: courses.map((course) => ({ ...course, context: contextOf.get(course.id) ?? null })),
      assessments: assessments.map((row) => ({ ...row, official_max_mark: row.official_max_mark === null ? null : Number(row.official_max_mark) })),
      marks: (submissions.data ?? []).filter((row) => ids.includes(row.assessment_id as string)).map((row) => ({ assessment_id: row.assessment_id as string, mark: Number(row.official_mark), weight: row.source_original_max_mark === null ? 100 : Number(row.source_original_max_mark) })),
      gradings: [...latest.entries()].map(([assessment_id, ai_score]) => ({ assessment_id, ai_score })),
      mappings: (mappings.data ?? []) as { assessment_id: string; competency_id: string }[],
      roles: buildLibrary(),
    });
  } catch { return []; }
}

async function latestBrief(supabase: SupabaseClient, term: TermChoice): Promise<DashboardSnapshot["brief"]> {
  const { data, error } = await supabase.from("overview_briefs").select("brief, created_at, provider_model").eq("term", term).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return { brief: data.brief as OverviewBrief, createdAt: data.created_at as string, model: data.provider_model as string };
}
