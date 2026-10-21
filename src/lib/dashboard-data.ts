import { demoData, demoMarkSeries } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import { describeSyncHealth, type SyncHealth, type SyncRun } from "@/lib/lms/sync-health";

export type DashboardSnapshot = {
  demoMode: boolean;
  courses: { id: string; code: string; title: string; term: string; materials?: number }[];
  marks: { id: string; title: string; course: string; date: string; mark: number; format: string }[];
  markSeries: { label: string; value: number }[];
  // Unweighted mean of every official mark (not just the recent rows shown); null when no marks exist.
  averageMark: number | null;
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
  markCount: demoData.assessments.length,
  mastery: demoData.mastery,
  assessmentCount: 12,
  topicCount: 11,
  syncHealth: null,
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return demoSnapshot;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase is not configured. Connect the private workspace before loading dashboard records.");
  }

  const supabase = await createClient();
  const [courseResult, assessmentResult, submissionResult, competencyResult, syncResult] = await Promise.all([
    supabase.from("courses").select("id, code, title, term").order("created_at", { ascending: false }),
    supabase.from("assessments").select("id, course_id, title, assessment_format, due_at"),
    supabase.from("submissions").select("id, assessment_id, official_mark, submitted_at").not("official_mark", "is", null).order("submitted_at", { ascending: false }),
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
    averageMark: averageOf(marks.map((item) => item.mark)),
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
