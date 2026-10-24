import type { SupabaseClient } from "@supabase/supabase-js";

// The first-run checklist: each step is read from real records, says what it fills in, and links to where it
// is done. The map is mostly grey until marks are released, so this explains what grey means and what fills it.
export type Step = { key: string; title: string; fills: string; href: string; done: boolean };

export async function onboardingSteps(client: SupabaseClient): Promise<Step[]> {
  const head = { count: "exact" as const, head: true };
  const total = (result: { count: number | null }) => result.count ?? 0;
  const [syncs, marks, drive, files, personality, reasoning, profiles, github, practice] = (await Promise.all([
    client.from("sync_runs").select("*", head),
    client.from("submissions").select("*", head).not("official_mark", "is", null),
    client.from("drive_scans").select("*", head),
    client.from("submission_documents").select("*", head),
    client.from("test_attempts").select("*", head).eq("kind", "personality").not("submitted_at", "is", null),
    client.from("test_attempts").select("*", head).eq("kind", "reasoning").not("submitted_at", "is", null),
    client.from("ai_context_reports").select("*", head),
    client.from("portfolio_items").select("*", head),
    client.from("weekly_practice").select("*", head).not("submitted_at", "is", null),
  ])).map(total);
  return [
    { key: "lms", title: "Sync your learning platform", fills: "Courses, assessments, briefs and official marks — the backbone of every page.", href: "/marks", done: syncs > 0 },
    { key: "drive", title: "Connect your Drive course folders", fills: "Course material for grading against the course, and your submitted files.", href: "/drive-sync", done: drive > 0 },
    { key: "files", title: "Get submitted work graded", fills: "Blind AI grades and code checks, and competencies where no mark is released yet.", href: "/grading", done: files > 0 },
    { key: "questionnaire", title: "Take the personality questionnaire (about 4 minutes)", fills: "The personality chart, tips for you, and context for your thinking patterns.", href: "/tests", done: personality > 0 },
    { key: "reasoning", title: "Take a reasoning test (Extreme, 18 minutes)", fills: "Foundational reasoning and analytical reasoning in your skills.", href: "/tests", done: reasoning > 0 },
    { key: "profile", title: "Paste your AI assistants' view of you", fills: "Context for the thinking patterns and the personality reading.", href: "/thinking", done: profiles > 0 },
    { key: "github", title: "Connect GitHub", fills: "Self-directed projects as evidence for technical, product and creative skills.", href: "/professional", done: github > 0 },
    { key: "practice", title: "Finish one weekly practice", fills: "Fresh, timed evidence on the competency you most need to settle.", href: "/practice", done: practice > 0 },
  ].concat(marks ? [] : [{ key: "marks", title: "Wait for your first released mark", fills: "Official standings; until then, figures rest on AI grades and are labelled provisional.", href: "/marks", done: false }]);
}
