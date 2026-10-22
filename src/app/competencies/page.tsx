import { AppShell } from "@/components/app-shell";
import { AssessmentCompetencyTagger } from "@/components/assessment-competency-tagger";
import { CompetencyWhy, type ClaimRow, type HistoryRow } from "@/components/competency-why";
import { CompetencyChallenge, type ChallengeRow } from "@/components/competency-challenge";
import { STATE_LABELS, type CompetencyState } from "@/lib/competency/classify";
import { buildCompetencyMap, type SubmissionRow } from "@/lib/competency/map";
import { parseCriterionScores } from "@/lib/feedback/criteria";
import { loadCompetencyInputs } from "@/lib/competency/load";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATE_ORDER: CompetencyState[] = ["demonstrated_strength", "emerging", "meets_expectations", "conflicting", "development_area", "insufficient_evidence"];

export default async function CompetenciesPage() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const data = demoMode || !hasSupabaseConfig() ? null : await loadData();
  const historyById = new Map<string, HistoryRow[]>();
  for (const row of data?.history ?? []) historyById.set(row.competency_id, [...(historyById.get(row.competency_id) ?? []), row]);
  const claimsById = new Map<string, ClaimRow[]>();
  for (const row of data?.claims ?? []) claimsById.set(row.competency_id, [...(claimsById.get(row.competency_id) ?? []), row]);
  const challengesById = new Map<string, ChallengeRow[]>();
  for (const row of data?.challenges ?? []) challengesById.set(row.competency_id, [...(challengesById.get(row.competency_id) ?? []), row]);
  const domains = data ? buildCompetencyMap(data) : [];
  const all = domains.flatMap((domain) => domain.competencies);
  const counts = new Map<CompetencyState, number>();
  for (const item of all) counts.set(item.assessment.state, (counts.get(item.assessment.state) ?? 0) + 1);
  const mappedTotal = all.filter((item) => item.mappedAssessments > 0).length;

  return <AppShell demoMode={demoMode}><div className="section-page">
    <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> EVIDENCE, NOT VERDICTS</div><h1>Competency map</h1><p className="page-subtitle">What your assessed work has demonstrated, what it has not, and what remains unknown.</p></div></div>
    <div className="info-callout"><span>Each competency is classified from official marks on the assessments mapped to it. A competency with no mapped, marked assessment is <strong>unknown</strong>, not weak. Open <em>Why this conclusion?</em> on any row to see the evidence, the benchmark and its limits.</span></div>
    {!data ? <section className="content-panel"><p className="empty-hint">{demoMode ? "Preview mode has no competency evidence. Connect the private workspace to map real assessments." : "Connect Supabase to load competency evidence."}</p></section> : <>
      <section className="competency-summary" aria-label="Summary by classification">
        {STATE_ORDER.map((state) => <div className={`competency-summary-item state-${state}`} key={state}><strong>{counts.get(state) ?? 0}</strong><span>{STATE_LABELS[state]}</span></div>)}
      </section>
      <p className="scope-note">{mappedTotal} of {all.length} competencies have at least one mapped assessment. Map more assessments below to widen evidence coverage.</p>
      {domains.map((domain) => <section className="content-panel competency-domain" key={domain.key}>
        <h2>{domain.name} <span className="panel-count">{domain.competencies.length}</span></h2>
        <div className="competency-list">{domain.competencies.map((item) => <article className="competency-row" key={item.id}>
          <div className="competency-row-head">
            <div><strong>{item.name}</strong><small>{item.description}</small></div>
            <div className="competency-verdict"><span className={`competency-state state-${item.assessment.state}`}>{STATE_LABELS[item.assessment.state]}</span><small>{item.assessment.headline} · {item.assessment.confidence === "insufficient" ? "no confidence rating" : `${item.assessment.confidence} confidence`}</small>{(challengesById.get(item.id) ?? []).some((row) => row.status === "open") && <small className="challenge-badge">Challenged · under review</small>}</div>
          </div>
          <CompetencyWhy assessment={item.assessment} history={historyById.get(item.id) ?? []} claims={claimsById.get(item.id) ?? []}>{(item.assessment.why.evidence.length > 0 || (challengesById.get(item.id) ?? []).length > 0) && <CompetencyChallenge competencyId={item.id} currentState={item.assessment.state} stateLabel={STATE_LABELS[item.assessment.state]} challenges={challengesById.get(item.id) ?? []} />}</CompetencyWhy>
        </article>)}</div>
      </section>)}
      <section className="content-panel"><h2>Map assessments to competencies <span className="panel-count">{data.assessments.length}</span></h2><p className="empty-hint">Tag each assessment with the competencies it actually tested. Tags are visible to both workspace members and are labelled as member-tagged in every explanation, not as official Mesa rubric criteria.</p>
        <AssessmentCompetencyTagger
          competencies={data.competencies.map(({ id, domain_name, name }) => ({ id, domain: domain_name, name }))}
          assessments={data.assessments.map((assessment) => ({ id: assessment.id, title: assessment.title, course: data.courses.find((course) => course.id === assessment.course_id)?.title ?? "Course", tagged: data.mappings.filter((row) => row.assessment_id === assessment.id && row.mapping_source === "user_tagged" && !row.criterion_label).map((row) => row.competency_id), locked: data.mappings.filter((row) => row.assessment_id === assessment.id && row.mapping_source !== "user_tagged" && row.review_status === "accepted" && !row.criterion_label).map((row) => row.competency_id), mark: latestMark(data.submissions, assessment.id), criteria: latestCriteria(data.submissions, assessment.id), criterionTags: Object.fromEntries(data.mappings.filter((row) => row.assessment_id === assessment.id && row.mapping_source === "user_tagged" && row.criterion_label).map((row) => [row.criterion_label!, row.competency_id])) }))}
        />
      </section>
    </>}
  </div></AppShell>;
}

function latestMark(submissions: SubmissionRow[], assessmentId: string): number | null {
  const rows = submissions.filter((row) => row.assessment_id === assessmentId && row.official_mark !== null).sort((a, b) => (b.source_updated_at ?? b.submitted_at ?? "").localeCompare(a.source_updated_at ?? a.submitted_at ?? ""));
  return rows.length ? Number(rows[0].official_mark) : null;
}

function latestCriteria(submissions: SubmissionRow[], assessmentId: string) {
  const rows = submissions.filter((row) => row.assessment_id === assessmentId && row.official_feedback).sort((a, b) => (b.source_updated_at ?? b.submitted_at ?? "").localeCompare(a.source_updated_at ?? a.submitted_at ?? ""));
  return rows.length ? parseCriterionScores(rows[0].official_feedback ?? "").map(({ label, score, max }) => ({ label, score, max })) : [];
}

async function loadData() {
  const supabase = await createClient();
  const [inputs, history, challenges, claims, evidence] = await Promise.all([
    loadCompetencyInputs(supabase),
    supabase.from("competency_snapshots").select("competency_id, state, confidence, headline, reason, recorded_at").order("recorded_at", { ascending: false }).limit(1000),
    supabase.from("competency_challenges").select("id, competency_id, disputed_state, statement, counterevidence, status, resolution_note, created_at, resolved_at").order("created_at", { ascending: false }),
    supabase.from("professional_claims").select("competency_id, claim, status, evidence_id").not("competency_id", "is", null).neq("status", "withdrawn"),
    supabase.from("professional_evidence").select("id, title"),
  ]);
  const evidenceTitle = new Map((evidence.data ?? []).map((row) => [row.id as string, row.title as string]));
  if (history.error || challenges.error) throw new Error("Could not load competency history. Check that the history migration is applied.");
  return { ...inputs, claims: (claims.data ?? []).map((row) => ({ competency_id: row.competency_id as string, claim: row.claim as string, status: row.status as string, source: evidenceTitle.get(row.evidence_id as string) ?? "Professional evidence" })), history: (history.data ?? []) as (HistoryRow & { competency_id: string })[], challenges: (challenges.data ?? []) as (ChallengeRow & { competency_id: string })[] };
}
