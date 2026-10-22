import { demoData, demoMarkSeries } from "@/lib/demo-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { describeSyncHealth, type SyncHealth, type SyncRun } from "@/lib/lms/sync-health";

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
};

export async function getDashboardSnapshot(client?: SupabaseClient): Promise<DashboardSnapshot> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return demoSnapshot;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase is not configured. Connect the private workspace before loading dashboard records.");
  }

  const supabase = client ?? await createClient();
  const [courseResult, assessmentResult, submissionResult, competencyResult, syncResult] = await Promise.all([
    supabase.from("courses").select("id, code, title, term").order("created_at", { ascending: false }),
    supabase.from("assessments").select("id, course_id, title, assessment_format, due_at"),
    supabase.from("submissions").select("id, assessment_id, official_mark, source_original_max_mark, submitted_at").not("official_mark", "is", null).order("submitted_at", { ascending: false }),
    supabase.from("topic_competencies").select("topic, state, score"),
    supabase.from("sync_runs").select("status, started_at, finished_at, message").eq("source_name", "Mesa Nexus MCP").order("started_at", { ascending: false }).limit(20),
  ]);

  const error = courseResult.error ?? assessmentResult.error ?? submissionResult.error ?? competencyResult.error ?? syncResult.error;
  if (error) throw new Error("Could not load the private workspace. Check the Supabase migration and project configuration.");

  const courses = courseResult.data ?? [];
  const assessments = assessmentResult.data ?? [];
  const assessmentById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const submissions = submissionResult.data ?? [];
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
      weight: submission.source_original_max_mark === null || submission.source_original_max_mark === undefined ? 100 : Number(submission.source_original_max_mark),
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
