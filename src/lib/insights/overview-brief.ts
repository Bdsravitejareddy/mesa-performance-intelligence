import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestJsonFromProvider } from "@/lib/ai/provider";
import { resolveProviderSettings } from "@/lib/ai/settings";
import { getDashboardSnapshot, type OverviewBrief } from "@/lib/dashboard-data";
import type { TermChoice } from "@/lib/term";

const SYSTEM = [
  "You write the opening summary of a student's performance dashboard from computed figures only.",
  "Interpret each course against the student's target roles using the dashboard's internal benchmarks (core 75, supporting 65, peripheral 50 — conventions of this dashboard, not employer requirements): say a mark is above or below the dashboard's benchmark for that role, never that a role 'requires' a mark. Use each role's relevanceReason when explaining why a course is core.",
  "Only recommend submitting work that appears in notSubmitted; never suggest submitting something already submitted.",
  "Never quote or paraphrase faculty feedback, and never restate a figure without saying what it means.",
  "Standing is the official weighted average; projectedWithAi is only an estimate including AI grades for unmarked work — never present it as the student's mark. Courses assessed via MRS are read against the cohort high (readAgainstCeiling), and courses whose results are expected later are pending, not weak. State evidence limits. A standing is settled only as far as officialShareOfCourseWeight goes: call a gap or strength confirmed only when official marks cover at least half the course weight; otherwise say it rests on the marks released so far. evidenceShareIncludingAiGrades is never a reason to call a result confirmed. A course with little of its weight demonstrated, or a standing that rests partly (basis mixed) or wholly (basis ai) on AI grades rather than official marks, is provisional. Do not speculate about what future marks must be.",
  "Be specific (course names, numbers), calibrated and brief. No flattery, no generic advice.",
  "Return JSON {\"headline\":string (max 14 words),\"summary\":string (max 2 sentences),\"insights\":[{\"title\":string,\"detail\":string (max 2 sentences),\"kind\":\"strength\"|\"gap\"|\"risk\"|\"opportunity\"|\"context\"}] (3 to 5),\"focus\":[string] (up to 3 concrete next steps)}.",
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
  };
}

function clean(raw: Record<string, unknown>): OverviewBrief | null {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const kinds = new Set(["strength", "gap", "risk", "opportunity", "context"]);
  const insights = (Array.isArray(raw.insights) ? raw.insights as Record<string, unknown>[] : []).map((item) => ({ title: text(item.title, 120), detail: text(item.detail, 400), kind: (kinds.has(String(item.kind)) ? item.kind : "context") as OverviewBrief["insights"][number]["kind"] })).filter((item) => item.title).slice(0, 5);
  const headline = text(raw.headline, 140);
  if (!headline || !insights.length) return null;
  return { headline, summary: text(raw.summary, 400), insights, focus: (Array.isArray(raw.focus) ? raw.focus : []).map((item) => text(item, 200)).filter(Boolean).slice(0, 3) };
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
