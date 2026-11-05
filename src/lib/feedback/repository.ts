import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// The feedback repository: every piece of feedback the member received, one row per point, from official LMS
// feedback, Mesa's Feedback page and the blind AI grader. Each point is tagged deterministically (no model) with a
// polarity, themes, the competencies those themes evidence, and — where advice has a direction — which way it pulls,
// so the most relevant points can be retrieved for a task and conflicting advice is shown rather than averaged.
// Faculty feedback always outranks the AI grader; an AI point never overrides a faculty one.

export type Source = "lms" | "mesa_feedback_page" | "ai_grader";
export type Polarity = "strength" | "improve" | "note";
export type FeedbackPoint = { key: string; source: Source; authority: "faculty" | "ai"; submissionId: string | null; assessmentId: string | null; courseId: string | null; assessmentTitle: string; courseTitle: string; text: string; polarity: Polarity; themes: string[]; direction: string | null; givenOn: string | null };
export type StoredPoint = FeedbackPoint & { id: string; addressedAt: string | null };

// Themes, the words that signal them, and the competencies they are evidence for.
export const THEMES: Record<string, { pattern: RegExp; competencies: string[]; label: string }> = {
  formatting: { pattern: /\bformat|decimal|currency|₹ ?not|rounded?\b/i, competencies: ["technical.analytics"], label: "Formatting and presentation of numbers" },
  formulas: { pattern: /\bformulas?\b|typed, not|hard-?coded/i, competencies: ["technical.analytics"], label: "Formulas and spreadsheet method" },
  accuracy: { pattern: /not quite right|wrong values?|numbers? (are )?wrong|numbers differ|incorrect|double-check|you got \S+ —/i, competencies: ["analytical.numerical_analysis"], label: "Accuracy of answers" },
  structure: { pattern: /\bstructur|numbered list|organis|breakdown|sub-?question|flow\b/i, competencies: ["analytical.structured_problem_solving"], label: "Structure and coverage" },
  evidence: { pattern: /actual numbers|from the data|key figure|computed|quantif|evidence|backtest/i, competencies: ["technical.analytics", "decision.judgement"], label: "Using the data as evidence" },
  reasoning: { pattern: /conclusion|reason(s|ing)?\b|justif|claim\b|why\b/i, competencies: ["decision.judgement"], label: "Reasoning and conclusions" },
  clarity: { pattern: /\bclear(ly)?\b|phrasing|hard to follow|concise|wordy|brief\b|plain/i, competencies: ["communication.clarity"], label: "Clarity of writing" },
  delivery: { pattern: /\bvoice|energy|modulation|eye contact|practised|opening|ending|pitch\b/i, competencies: ["communication.persuasion"], label: "Spoken delivery" },
  tone: { pattern: /\bdear\b|\bhi\b|apolog|appreciat|tone|conditional phrasing|polite|fear\b/i, competencies: ["communication.stakeholder_management"], label: "Tone with stakeholders" },
  architecture: { pattern: /architecture|backend|how the decisions were made|pipeline|system\b|components? map/i, competencies: ["technical.systems_understanding"], label: "System design and architecture" },
  design: { pattern: /\bdesign\b|visual|interface|hierarchy|layout/i, competencies: ["product.customer_needs"], label: "Product and visual design" },
  completeness: { pattern: /missing|only covers|incomplete|not computed|every sub-?question|does not address/i, competencies: ["analytical.structured_problem_solving"], label: "Completeness" },
};

// Advice that has a direction; two points on the same theme pulling opposite ways are a conflict.
const DIRECTIONS: { theme: string; direction: string; opposite: string; pattern: RegExp }[] = [
  { theme: "clarity", direction: "more_detail", opposite: "more_concise", pattern: /\b(too )?brief\b|more detail|elaborate|expand|too short|reasons are brief/i },
  { theme: "clarity", direction: "more_concise", opposite: "more_detail", pattern: /\bconcise|too long|wordy|shorter|cut down|trim/i },
  { theme: "tone", direction: "more_formal", opposite: "less_formal", pattern: /more formal|“?dear .+ suits better|formal/i },
  { theme: "tone", direction: "less_formal", opposite: "more_formal", pattern: /less formal|conversational|too stiff/i },
  { theme: "delivery", direction: "more_energy", opposite: "calmer", pattern: /more energy|bring .*energy|livelier/i },
  { theme: "delivery", direction: "calmer", opposite: "more_energy", pattern: /slow down|calmer|less rushed/i },
];

const PREFIX: [RegExp, Polarity][] = [
  [/^(what went well|right|strongest|well done)\s*:\s*/i, "strength"],
  [/^(to fix|what to improve|next steps?|partly|weakest|improve)\s*:\s*/i, "improve"],
  [/^notes?\s*:\s*/i, "note"],
];
const POSITIVE = /\b(good|well|strong(est)?|clear|sound|correct|sincere|accurately|exceptional|memorable|easy to follow|right)\b/i;
const NEGATIVE = /\b(however|but|missing|lacks?|weak(est)?|should|could|needs?|not\b|unclear|wrong|brief|hard to follow|fix|improve|less|more)\b/i;

export function classify(text: string): { text: string; polarity: Polarity } {
  for (const [pattern, polarity] of PREFIX) if (pattern.test(text)) return { text: text.replace(pattern, "").trim(), polarity };
  // Without a label: a corrective cue wins over praise ("Correct answer, but not formatted" is something to fix).
  return { text, polarity: NEGATIVE.test(text) ? "improve" : POSITIVE.test(text) ? "strength" : "note" };
}

export function tag(text: string): { themes: string[]; direction: string | null } {
  const themes = Object.entries(THEMES).filter(([, theme]) => theme.pattern.test(text)).map(([name]) => name);
  const direction = DIRECTIONS.find((entry) => entry.pattern.test(text))?.direction ?? null;
  return { themes, direction };
}

// Splits stored feedback into points: one per line, list item or (for long free text) sentence. The source line and
// "Label score/max" criterion lines of imported feedback are marks, not feedback, and are skipped.
export function splitPoints(feedback: string): string[] {
  return feedback.split(/\r?\n|\s*•\s*|\s*\|\s*/).flatMap((line) => line.length > 260 ? line.split(/(?<=[.!?])\s+(?=[A-Z“"])/) : [line])
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12 && !/^Mesa Feedback page — /.test(line) && !/^[A-Za-z0-9 ,'’&\-]{1,60}\s\d{1,3}(\.\d{1,2})?\/\d{1,3}(\.\d{1,2})?$/.test(line) && !/^(L\d|MRS|Overall|Pitch \d|Written Assessment|Big Mastery Question|Track Recommendation|Components Map|Link Opens|Build Quality|Design|Viva)\b[^:—]*$/.test(line));
}

const keyOf = (...parts: (string | null)[]) => createHash("sha256").update(parts.map((part) => part ?? "").join("|")).digest("hex");

type SubmissionRow = { id: string; assessment_id: string; official_feedback: string | null; official_mark_source: string | null; source_updated_at: string | null; created_at: string };
type GradingRow = { submission_id: string; assessment_id: string; ai_report: { strengths?: string[]; issues?: string[]; missingRequirements?: string[] } | null; ai_status: string | null; created_at: string };

export function pointsFrom(submissions: SubmissionRow[], gradings: GradingRow[], assessments: Map<string, { title: string; courseId: string }>, courses: Map<string, string>): FeedbackPoint[] {
  const points: FeedbackPoint[] = [];
  const base = (submissionId: string, assessmentId: string) => { const assessment = assessments.get(assessmentId); return { submissionId, assessmentId, courseId: assessment?.courseId ?? null, assessmentTitle: assessment?.title ?? "", courseTitle: courses.get(assessment?.courseId ?? "") ?? "" }; };
  for (const row of submissions) {
    if (!row.official_feedback?.trim()) continue;
    const source: Source = row.official_mark_source === "Mesa Feedback page" ? "mesa_feedback_page" : "lms";
    for (const line of splitPoints(row.official_feedback)) {
      const { text, polarity } = classify(line);
      points.push({ key: keyOf(source, row.id, text), source, authority: "faculty", ...base(row.id, row.assessment_id), text: text.slice(0, 1200), polarity, ...tag(text), givenOn: (row.source_updated_at ?? row.created_at).slice(0, 10) });
    }
  }
  // The latest AI grade per submission, at most six points, clearly marked as the AI grader's.
  const latest = new Map<string, GradingRow>();
  for (const row of [...gradings].sort((a, b) => b.created_at.localeCompare(a.created_at))) if (row.ai_report && row.ai_status !== "failed" && !latest.has(row.submission_id)) latest.set(row.submission_id, row);
  for (const row of latest.values()) {
    const report = row.ai_report!;
    const items: [string, Polarity][] = [...(report.strengths ?? []).slice(0, 2).map((text) => [text, "strength"] as [string, Polarity]), ...[...(report.issues ?? []), ...(report.missingRequirements ?? [])].slice(0, 4).map((text) => [text, "improve"] as [string, Polarity])];
    for (const [raw, polarity] of items) {
      const text = String(raw).replace(/\s+/g, " ").trim();
      if (text.length < 12) continue;
      points.push({ key: keyOf("ai_grader", row.submission_id, text), source: "ai_grader", authority: "ai", ...base(row.submission_id, row.assessment_id), text: text.slice(0, 1200), polarity, ...tag(text), givenOn: row.created_at.slice(0, 10) });
    }
  }
  return points;
}

export type Conflict = { kind: "opposite_advice" | "praised_and_flagged" | "faculty_vs_ai"; theme: string; summary: string; points: [FeedbackPoint, FeedbackPoint] };

// Conflicts are reported, never resolved by averaging: opposite directions on one theme; a theme praised in one
// assessment and flagged in another (often task-specific); faculty and the AI grader disagreeing on one submission.
export function findConflicts(points: FeedbackPoint[]): Conflict[] {
  const out: Conflict[] = [];
  const seen = new Set<string>();
  // One entry per kind, theme and place: many pairs saying the same thing are one conflict.
  const add = (conflict: Conflict, place = conflict.points.map((point) => point.key).sort().join(":")) => { const id = `${conflict.kind}:${conflict.theme}:${place}`; if (!seen.has(id)) { seen.add(id); out.push(conflict); } };
  const where = (point: FeedbackPoint) => point.assessmentTitle || point.courseTitle || "one assessment";
  for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) {
    const [a, b] = [points[i], points[j]];
    for (const theme of a.themes.filter((name) => b.themes.includes(name))) {
      const pair = DIRECTIONS.find((entry) => entry.theme === theme && entry.direction === a.direction && entry.opposite === b.direction);
      if (pair) add({ kind: "opposite_advice", theme, summary: `${THEMES[theme].label}: one piece of feedback asks for ${a.direction!.replace("_", " ")}, another for ${b.direction!.replace("_", " ")}.`, points: [a, b] }, [a.assessmentId, b.assessmentId].sort().join(":"));
      else if (a.submissionId === b.submissionId && a.authority !== b.authority && a.polarity !== b.polarity && a.polarity !== "note" && b.polarity !== "note") {
        const [faculty, ai] = a.authority === "faculty" ? [a, b] : [b, a];
        add({ kind: "faculty_vs_ai", theme, summary: `${THEMES[theme].label}: on ${where(faculty)}, the faculty ${faculty.polarity === "strength" ? "praised" : "flagged"} it but the AI grader ${ai.polarity === "strength" ? "praised" : "flagged"} it. The faculty's view is the official one.`, points: [faculty, ai] }, faculty.submissionId ?? "");
      }
    }
  }
  // Praised in one assessment and flagged in others: one entry per theme (not one per pair), faculty points only.
  for (const theme of Object.keys(THEMES)) {
    const faculty = points.filter((point) => point.authority === "faculty" && point.themes[0] === theme);
    const praised = faculty.filter((point) => point.polarity === "strength"), flagged = faculty.filter((point) => point.polarity === "improve");
    const praisedIn = new Set(praised.map((point) => point.assessmentId)), flaggedElsewhere = flagged.filter((point) => !praisedIn.has(point.assessmentId));
    if (!praised.length || !flaggedElsewhere.length) continue;
    const others = new Set(flaggedElsewhere.map(where));
    add({ kind: "praised_and_flagged", theme, summary: `${THEMES[theme].label}: praised in ${where(praised[0])}, flagged in ${others.size === 1 ? [...others][0] : `${others.size} other assessments`} — likely depends on the task.`, points: [praised[0], flaggedElsewhere[0]] });
  }
  return out;
}

export type RankQuery = { courseId?: string | null; competencyIds?: string[]; text?: string; openOnly?: boolean; limit?: number };

// The points most relevant to a task: theme or competency match, the same course, shared words, faculty over AI,
// still open over addressed, and recent over old. Each result says why it was chosen.
export function rankPoints<T extends FeedbackPoint & { addressedAt?: string | null }>(points: T[], query: RankQuery): (T & { score: number; why: string[] })[] {
  const wanted = new Set(query.competencyIds ?? []);
  const words = new Set((query.text ?? "").toLowerCase().match(/[a-z]{5,}/g) ?? []);
  const now = Date.now();
  return points.filter((point) => !query.openOnly || !point.addressedAt).map((point) => {
    const why: string[] = [];
    let score = 0;
    const competencies = point.themes.flatMap((theme) => THEMES[theme]?.competencies ?? []);
    if (competencies.some((id) => wanted.has(id))) { score += 4; why.push("matches the skill"); }
    if (query.courseId && point.courseId === query.courseId) { score += 2; why.push("same course"); }
    const shared = (point.text.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((word) => words.has(word)).length;
    if (shared) { score += Math.min(3, shared); why.push("shares the topic"); }
    if (point.authority === "faculty") { score += 2; why.push("from faculty"); }
    if (point.polarity === "improve") score += 1;
    if (!point.addressedAt) score += 1;
    if (point.givenOn) score += Math.max(0, 1 - (now - Date.parse(point.givenOn)) / (180 * 86_400_000));
    return { ...point, score: Math.round(score * 100) / 100, why };
  }).filter((point) => point.score > 2).sort((a, b) => b.score - a.score).slice(0, query.limit ?? 8);
}

// Rebuilds the stored points from their sources. New points are inserted, points whose source text is gone are
// removed, unchanged points are left alone (so the member's "addressed" marks and timestamps survive).
export async function rebuildFeedbackItems(client: SupabaseClient): Promise<{ inserted: number; removed: number; total: number }> {
  const [submissions, gradings, assessments, courses, existing] = await Promise.all([
    client.from("submissions").select("id, user_id, assessment_id, official_feedback, official_mark_source, source_updated_at, created_at"),
    client.from("submission_gradings").select("submission_id, assessment_id, ai_report, ai_status, created_at").not("ai_report", "is", null),
    client.from("assessments").select("id, title, course_id"),
    client.from("courses").select("id, title, user_id"),
    client.from("feedback_items").select("id, item_key"),
  ]);
  const assessmentMap = new Map((assessments.data ?? []).map((row) => [row.id as string, { title: row.title as string, courseId: row.course_id as string }]));
  const courseMap = new Map((courses.data ?? []).map((row) => [row.id as string, row.title as string]));
  const owners = new Map((courses.data ?? []).map((row) => [row.id as string, row.user_id as string]));
  const points = pointsFrom((submissions.data ?? []) as SubmissionRow[], (gradings.data ?? []) as GradingRow[], assessmentMap, courseMap);
  const have = new Map((existing.data ?? []).map((row) => [row.item_key as string, row.id as string]));
  const fresh = points.filter((point, index) => !have.has(point.key) && points.findIndex((other) => other.key === point.key) === index);
  const keep = new Set(points.map((point) => point.key));
  const stale = [...have].filter(([key]) => !keep.has(key)).map(([, id]) => id);
  if (fresh.length) await client.from("feedback_items").insert(fresh.map((point) => ({
    user_id: owners.get(point.courseId ?? "") ?? (submissions.data ?? []).find((row) => row.id === point.submissionId)?.user_id,
    item_key: point.key, source: point.source, authority: point.authority, submission_id: point.submissionId, assessment_id: point.assessmentId, course_id: point.courseId,
    assessment_title: point.assessmentTitle.slice(0, 300), course_title: point.courseTitle.slice(0, 300), text: point.text, polarity: point.polarity, themes: point.themes, direction: point.direction, given_on: point.givenOn,
  })));
  if (stale.length) await client.from("feedback_items").delete().in("id", stale);
  return { inserted: fresh.length, removed: stale.length, total: points.length };
}

export async function loadPoints(client: SupabaseClient): Promise<StoredPoint[]> {
  const { data } = await client.from("feedback_items").select("id, item_key, source, authority, submission_id, assessment_id, course_id, assessment_title, course_title, text, polarity, themes, direction, given_on, addressed_at");
  return (data ?? []).map((row) => ({ id: row.id, key: row.item_key, source: row.source, authority: row.authority, submissionId: row.submission_id, assessmentId: row.assessment_id, courseId: row.course_id, assessmentTitle: row.assessment_title, courseTitle: row.course_title, text: row.text, polarity: row.polarity, themes: row.themes ?? [], direction: row.direction, givenOn: row.given_on, addressedAt: row.addressed_at }));
}
