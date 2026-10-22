import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestJsonFromProvider } from "@/lib/ai/provider";
import { resolveProviderSettings } from "@/lib/ai/settings";
import { getDashboardSnapshot, type OverviewBrief } from "@/lib/dashboard-data";
import type { TermChoice } from "@/lib/term";

const SYSTEM = [
  "You write the opening summary of a student's performance dashboard from computed figures only.",
  "Interpret each course against the student's target roles: a course marked core for a role must reach its threshold; a supporting course only needs its lower threshold. Say plainly when a mark is good enough for a role and when it is not.",
  "Never quote or paraphrase faculty feedback, and never restate a figure without saying what it means.",
  "State evidence limits: a course with little of its weight demonstrated, or a standing based on AI grades rather than official marks, is provisional.",
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
      standing: course.standing, basis: course.basis, official: course.official, ai: course.ai,
      demonstratedShare: course.demonstratedShare, evidenced: `${course.evidenced}/${course.assessments}`,
      roles: course.roles.map((role) => ({ role: role.role, relevance: role.relevance, threshold: role.threshold, verdict: role.verdict })),
    })),
    competencies: snapshot.insights ? { assessed: snapshot.insights.competenciesAssessed, total: snapshot.insights.competenciesTotal, strengths: snapshot.insights.strengths, gaps: snapshot.insights.gaps } : null,
    readiness: snapshot.insights?.readiness ?? [],
    grading: snapshot.insights?.grading ?? null,
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
