import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Why } from "@/components/why";
import { cachedRead } from "@/lib/data/cached";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { DEFAULT_RUBRIC, loadRubric } from "@/lib/settings/rubric";
import { DIMENSION_MEANING } from "@/lib/behaviour/analyse";

export const dynamic = "force-dynamic";

// How every figure is derived, in plain language, with the live rubric values.
export default async function MethodologyPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const rubric = demoMode || !hasSupabaseConfig() ? DEFAULT_RUBRIC : await cachedRead("rubric:load", (client: SupabaseClient) => loadRubric(client));
  return <AppShell demoMode={demoMode}><div className="section-page methodology">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> How it works</div><h1>Methodology</h1><p className="page-subtitle">Where every figure comes from, what it can and cannot tell you, and why it is built this way. The weights quoted here are your current ones from <Link href="/rubric" className="text-link">Rubric &amp; weights</Link>.</p></div></div>
    <section className="content-panel"><h2>Can I trust this?</h2>
      <ul className="method-list">
        <li><strong>Official marks are never changed.</strong> They come straight from the learning platform and stay on their 0–100 scale. Everything else is shown beside them, never instead of them.</li>
        <li><strong>Every AI judgement must quote its evidence.</strong> A score is kept only when its quote is found word for word in your work, feedback or records; unquoted judgements are dropped, not guessed.</li>
        <li><strong>AI grades are blind.</strong> The grader never sees your official mark, feedback or identity, so it cannot simply agree with your faculty.</li>
        <li><strong>Missing evidence is never a weakness.</strong> Anything without evidence is shown as “no evidence yet”, never as zero.</li>
        <li><strong>Benchmarks are conventions, not truths.</strong> No external body sets “75 for a core course”; these are starting points you can change. Research-backed parts are labelled and linked on <Link href="/tests" className="text-link">Reasoning &amp; personality</Link>.</li>
        <li><strong>Known limits are stated.</strong> Few official marks are released yet, so most figures rest partly on AI grades and are labelled provisional; images and charts in files are not read; projects are judged from their documentation and structure, not by running the code.</li>
      </ul>
    </section>
    <div className="method-grid">
      <Block title="Sources and refresh" items={[
        "Learning platform (official marks, feedback, assignment briefs, course list) via its read-only connector.",
        "Your submitted files and links, from the platform pages and your Drive folders.",
        "GitHub projects (read-only: descriptions, READMEs, structure), your questionnaires and tests, your notes and assistant profiles.",
        "Everything refreshes nightly in this order: platform sync → Drive matching and skill mapping → grading → GitHub → project evaluations → thinking patterns → personality reading → AI skill view. “Refresh everything” runs the same chain on demand.",
      ]} />
      <Block title="Weighted average and course standing" items={[
        "Official marks only, each weighted by its maximum marks and by its stakes.",
        `Stakes multipliers: term exams ×${rubric.stakes.exam}, other graded work ×${rubric.stakes.graded}, practice ×${rubric.stakes.practice}.`,
        "“With AI estimates” adds blind AI grades for unmarked work, shown beside the official figure and never as your mark.",
        "A course result is called settled only when official marks cover at least half of the course's weight.",
      ]} />
      <Block title="Course benchmarks for target roles" items={[
        "A course is core to a role when its assessments cover at least a fifth of the skills that role's job postings ask for, or it is among the three courses covering the most; supporting when it covers some; peripheral when none.",
        `Benchmarks: core ${rubric.roleThresholds.core}, supporting ${rubric.roleThresholds.supporting}, peripheral ${rubric.roleThresholds.peripheral} — dashboard conventions you can change.`,
      ]} />
      <Block title="Graded work: three views of a submission" items={[
        "Official — your faculty's mark.",
        "AI (blind) — graded against the assignment brief and course material on meaning, not keywords; a different method that reaches a right answer is not penalised. The grader first checks the file is really this assessment's submission and flags it if not.",
        "Code check — a deterministic tick-list of whether each question or task in the brief was attempted. It checks completeness, not quality; with no task list it gives no score.",
        "Where the marks went — lost marks split by the faculty's own criterion scores or question-by-question feedback; only when neither exists, by the blind AI's weakest criteria, labelled as an estimate.",
      ]} />
      <Block title="Competencies" items={[
        "Each assessment is mapped automatically to the competencies it tests, from its brief and course materials, with a confidence and reason.",
        `A result of ${rubric.bands.high}+ is high and below ${rubric.bands.low} is low. Two high results on different assessments make a strength; two low results a development area; one is only a signal.`,
        "Official marks come first; a blind AI grade stands in where no mark exists, at low confidence. Practice work is shown but does not decide a classification when graded work exists.",
      ]} />
      <Block title="Skills: Marked, AI view, Holistic" items={[
        `Marked — official marks and blind AI grades of your submissions (AI grades count ×${rubric.aiGradeFactor}), weighted by stakes.`,
        "AI view — the AI reads all your evidence (graded work, feedback, projects, conversations if included, tests and self-report) and scores each skill 0–100; each score must quote a non-profile source.",
        `Holistic — ${Math.round(rubric.quantShare * 100)}% marks and tests, ${Math.round((1 - rubric.quantShare) * 100)}% the AI's qualitative reading (scaled by its confidence), with reasoning tests adding ${rubric.reasoningShare} to analytical reasoning.`,
      ]} />
      <Block title="Thinking patterns" items={[
        ...Object.entries(DIMENSION_MEANING).map(([name, meaning]) => `${name}: ${meaning}`),
        "Evidence strength counts independent sources: one is limited, two moderate, three or more substantial. Assistant profiles add context but never count.",
      ]} />
      <Block title="Personality and reasoning" items={[
        "The questionnaire uses the public-domain IPIP Big-Five markers, drawn at random each time; scores are positions on the 1–5 answer scale, not comparisons with other people.",
        "The context reading estimates the same traits from what you have written, and every score must quote a source. It sits beside your answers, never replacing them.",
        "Reasoning tests are generated fresh each time; the difficulty-adjusted score uses an item-response (Rasch) model anchored to the questions, not to other people — there are no cohort norms yet.",
      ]} />
      <Block title="Projects" items={[
        "Judged blind as academic case studies against fixed criteria, and against the problem statement you add. Deployment, users and real-world utility are never assessed.",
        "Only your own write-up can support communication and first-principles criteria; a given problem statement is the standard, never your evidence.",
        "Evidence is the project's description, README (up to 12,000 characters) and repository structure; code is not run, and what cannot be judged is marked not assessable.",
      ]} />
    </div>
  </div></AppShell>;
}

function Block({ title, items }: { title: string; items: string[] }) {
  return <section className="content-panel method-block"><h2>{title}</h2><ul className="method-list">{items.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>{items.length > 3 && <Why label="More detail"><ul className="method-list">{items.slice(3).map((item) => <li key={item}>{item}</li>)}</ul></Why>}</section>;
}

